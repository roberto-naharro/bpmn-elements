"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = SignalTask;
exports.SignalTaskBehaviour = SignalTaskBehaviour;

var _Activity = _interopRequireDefault(require("../activity/Activity"));

var _Errors = require("../error/Errors");

var _messageHelper = require("../messageHelper");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function SignalTask(activityDef, context) {
  return (0, _Activity.default)(SignalTaskBehaviour, activityDef, context);
}

function SignalTaskBehaviour(activity) {
  const {
    id,
    type,
    behaviour,
    broker
  } = activity;
  const loopCharacteristics = behaviour.loopCharacteristics && behaviour.loopCharacteristics.Behaviour(activity, behaviour.loopCharacteristics);
  const source = {
    id,
    type,
    loopCharacteristics,
    execute
  };
  return source;

  function execute(executeMessage) {
    const content = executeMessage.content;

    if (loopCharacteristics && content.isRootScope) {
      return loopCharacteristics.execute(executeMessage);
    }

    const {
      executionId
    } = content;
    broker.subscribeTmp('api', `activity.#.${executionId}`, onApiMessage, {
      noAck: true,
      consumerTag: `_api-${executionId}`
    });
    broker.publish('event', 'activity.wait', (0, _messageHelper.cloneContent)(content, {
      state: 'wait',
      isRecovered: executeMessage.fields.redelivered
    }));

    function onApiMessage(routingKey, message) {
      const messageType = message.properties.type;

      switch (messageType) {
        case 'stop':
          return stop();

        case 'signal':
          stop();
          return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(content, {
            output: message.content.message,
            state: 'signal'
          }));

        case 'error':
          stop();
          return broker.publish('execution', 'execute.error', (0, _messageHelper.cloneContent)(content, {
            error: new _Errors.ActivityError(message.content.message, executeMessage, message.content)
          }, {
            mandatory: true
          }));

        case 'cancel':
        case 'discard':
          stop();
          return broker.publish('execution', `execute.${messageType}`, (0, _messageHelper.cloneContent)(content, {
            state: messageType
          }));
      }
    }

    function stop() {
      return broker.cancel(`_api-${executionId}`);
    }
  }
}