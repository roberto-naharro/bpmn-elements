import Activity from '../activity/Activity';
import EventDefinitionExecution from '../eventDefinitions/EventDefinitionExecution';
import {cloneContent, cloneMessage} from '../messageHelper';

export default function BoundaryEvent(activityDef, context) {
  return Activity(BoundaryEventBehaviour, {...activityDef}, context);
}

export function BoundaryEventBehaviour(activity) {
  const {id, type = 'BoundaryEvent', broker, attachedTo, behaviour = {}, eventDefinitions, logger} = activity;
  const {id: attachedToId} = attachedTo;

  broker.assertExchange('attached-event', 'topic');

  const cancelActivity = 'cancelActivity' in behaviour ? behaviour.cancelActivity : true;
  const eventDefinitionExecution = eventDefinitions && EventDefinitionExecution(activity, eventDefinitions, 'execute.bound.completed');

  return {
    id,
    type,
    attachedTo,
    cancelActivity,
    execute,
  };

  function execute(executeMessage) {
    const executeContent = cloneContent(executeMessage.content);
    const {isRootScope, executionId, inbound} = executeContent;

    let parentExecutionId, completeContent;
    const attachConsumerTags = [];
    if (isRootScope) {
      parentExecutionId = executionId;
      broker.subscribeTmp('attached-event', 'activity.leave', onAttachedLeave, {noAck: true, consumerTag: `_bound-listener-${parentExecutionId}`, priority: 300});

      attachedTo.broker.createShovel(`shovel-event-${id}`, {
        exchange: 'event',
        priority: 300,
      }, {
        broker,
        exchange: 'attached-event',
      }, {
        cloneMessage(msg) {
          const shovelMsg = cloneMessage(msg);
          shovelMsg.properties.mandatory = undefined;
          return shovelMsg;
        },
      });

      broker.subscribeOnce('execution', 'execute.detach', onDetach, {consumerTag: '_detach-tag'});
      broker.subscribeOnce('execution', 'execute.bound.completed', onCompleted, {consumerTag: `_execution-completed-${parentExecutionId}`});
      broker.subscribeOnce('api', `activity.#.${parentExecutionId}`, onApiMessage, {consumerTag: `_api-${parentExecutionId}`});
    }

    if (eventDefinitionExecution) eventDefinitionExecution.execute(executeMessage);

    function onCompleted(_, message) {
      if (!cancelActivity && !message.content.cancelActivity) {
        stop();
        return broker.publish('execution', 'execute.completed', cloneContent(message.content));
      }

      completeContent = message.content;

      const attachedToContent = inbound && inbound[0];
      logger.debug(`<${executionId} (id)> cancel ${attachedTo.status} activity <${attachedToContent.executionId} (${attachedToContent.id})>`);

      attachedTo.getApi({
        content: cloneContent(attachedToContent),
      }).discard(cloneContent(completeContent));
    }

    function onAttachedLeave(routingKey, message) {
      if (message.content.id !== attachedToId) return;
      stop();
      if (!completeContent) return broker.publish('execution', 'execute.discard', executeContent);
      return broker.publish('execution', 'execute.completed', completeContent);
    }

    function onDetach(_, {content}) {
      logger.debug(`<${parentExecutionId} (${id})> detach from activity <${attachedTo.id}>`);
      stop(true);

      broker.subscribeOnce('execution', 'execute.bound.completed', onDetachedCompleted, {consumerTag: `_execution-completed-${parentExecutionId}`});
      attachedTo.broker.createShovel(parentExecutionId, {
        exchange: 'execution',
      }, {
        broker,
        exchange: content.bindExchange,
      });

      function onDetachedCompleted(__, message) {
        stop();
        completeContent = cloneContent(message.content);
        if (!cancelActivity && !message.content.cancelActivity) {
          return broker.publish('execution', 'execute.completed', completeContent);
        }

        const attachedToContent = inbound && inbound[0];
        if (attachedToContent) {
          logger.debug(`<${executionId} (${id})> cancel ${attachedTo.status} activity <${attachedToContent.executionId} (${attachedToContent.id})>`);
          attachedTo.getApi({
            content: cloneContent(attachedToContent),
          }).discard(cloneContent(completeContent));
        }

        return broker.publish('execution', 'execute.completed', completeContent);
      }
    }

    function onApiMessage(_, message) {
      const messageType = message.properties.type;
      switch (messageType) {
        case 'discard':
          stop();
          break;
        case 'stop':
          stop();
          break;
      }
    }

    function stop(detaching) {
      attachedTo.broker.cancel(`_bound-listener-${parentExecutionId}`);

      broker.cancel(`_bound-listener-${parentExecutionId}`);
      attachConsumerTags.splice(0).forEach((tag) => attachedTo.broker.cancel(tag));

      broker.cancel('_expect-tag');
      broker.cancel('_detach-tag');
      broker.cancel(`_execution-completed-${parentExecutionId}`);

      if (detaching) return;

      attachedTo.broker.closeShovel(`shovel-event-${id}`);
      attachedTo.broker.closeShovel(parentExecutionId);
      broker.cancel(`_api-${parentExecutionId}`);
    }
  }
}
