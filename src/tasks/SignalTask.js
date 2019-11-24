import Activity from '../activity/Activity';
import { ActivityError } from '../error/Errors';
import {cloneContent} from '../messageHelper';

export default function SignalTask(activityDef, context) {
  return Activity(SignalTaskBehaviour, activityDef, context);
}

export function SignalTaskBehaviour(activity) {
  const {id, type, behaviour, broker} = activity;
  const loopCharacteristics = behaviour.loopCharacteristics && behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);

  const source = {
    id,
    type,
    loopCharacteristics,
    execute,
  };

  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;
    if (loopCharacteristics && content.isRootScope) {
      return loopCharacteristics.execute(executeMessage);
    }

    const {executionId} = content;

    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {noAck: true, consumerTag: `_api-${executionId}`});
    broker.publish('event', 'activity.wait', cloneContent(content, {state: 'wait', isRecovered: executeMessage.fields.redelivered}));

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'stop':
          return stop();
        case 'signal':
          stop();
          return broker.publish('execution', 'execute.completed', cloneContent(content, {output: message.content.message, state: 'signal'}));
        case 'error':
          stop();
          return broker.publish('execution', 'execute.error', cloneContent(content, {error: new ActivityError(message.content.message, executeMessage, message.content)}, {mandatory: true}));
        case 'cancel':
        case 'discard':
          stop();
          return broker.publish('execution', `execute.${messageType}`, cloneContent(content, {state: messageType}));
      }
    }

    function stop() {
      return broker.cancel(`_api-${executionId}`);
    }
  }
}
