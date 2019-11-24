import BpmnError from '../../src/error/BpmnError';
import Environment from '../../src/Environment';
import ErrorEventDefinition from '../../src/eventDefinitions/ErrorEventDefinition';
import testHelpers from '../helpers/testHelpers';
import {ActivityBroker} from '../../src/EventBroker';

describe('ErrorEventDefinition', () => {
  describe('catch', () => {
    let event;
    beforeEach(() => {
      const environment = Environment({ Logger: testHelpers.Logger });

      event = {
        id: 'bound',
        type: 'bpmn:Event',
        broker: ActivityBroker(this).broker,
        environment,
        getActivityById(id) {
          if (id !== 'error_1') return;

          return BpmnError({
            id: 'error_1',
            type: 'bpmn:Error',
            name: 'CatchError',
            behaviour: {
              errorCode: 'ERR_MINE',
            },
          }, {environment});
        },
      };
    });

    it('publishes wait event on parent broker', () => {
      const catchError = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      catchError.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.wait');
      expect(messages[0].content).to.have.property('executionId', 'event_1');
      expect(messages[0].content.parent).to.have.property('id', 'theProcess');
      expect(messages[0].content.parent).to.have.property('executionId', 'theProcess_0');
    });

    it('completes and clears listeners when error is caught', () => {
      const catchError = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchError.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'activity.throw.event_1', {});

      expect(messages).to.have.length(1);

      event.broker.cancel('_test-tag');

      expect(event.broker).to.have.property('consumerCount', 0);
    });


    it('completes and clears listeners if caught before execution', () => {
      const catchError = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      event.broker.publish('api', 'activity.throw.event_1', {});

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.completed', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchError.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('completes and clears listeners if discarded', () => {
      const catchError = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.discard', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchError.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'activity.discard.event_1_0', {}, {type: 'discard'});

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    it('stops and clears listeners if stopped', () => {
      const catchError = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
      });

      const messages = [];
      event.broker.subscribeTmp('execution', 'execute.discard', (_, msg) => {
        messages.push(msg);
      }, {noAck: true, consumerTag: '_test-tag'});

      catchError.execute({
        fields: {},
        content: {
          executionId: 'event_1_0',
          index: 0,
          parent: {
            id: 'bound',
            executionId: 'event_1',
            path: [{
              id: 'theProcess',
              executionId: 'theProcess_0'
            }]
          },
        },
      });

      event.broker.publish('api', 'activity.discard.event_1_0', {}, {type: 'discard'});

      event.broker.cancel('_test-tag');

      expect(messages).to.have.length(1);

      expect(event.broker).to.have.property('consumerCount', 0);
    });

    describe('api', () => {
      it('publishes catch message with source and error when delegated anonymous error is published', () => {
        const definition = ErrorEventDefinition(event, {
          type: 'bpmn:ErrorEventDefinition',
        });

        let message;
        event.broker.subscribeOnce('event', 'activity.catch', (_, msg) => {
          message = msg;
        });

        definition.execute({
          fields: {},
          content: {
            id: 'bound',
            executionId: 'bound_1_0',
            index: 0,
            parent: {
              id: 'bound',
              executionId: 'bound_1',
              path: [{
                id: 'process_1'
              }]
            },
          },
        });

        event.broker.publish('api', 'activity.throw.errorProne_1', {id: 'errorProne', executionId: 'errorProne_1', message: {
          name: 'Always'
        }});

        expect(message).to.be.ok;

        expect(message).to.have.property('content').with.property('id', 'bound');
        expect(message.content).to.have.property('executionId', 'bound_1');
        expect(message.content.parent).to.have.property('id', 'process_1');
        expect(message.content).to.have.property('source').with.property('id', 'errorProne');
        expect(message.content.source).to.have.property('executionId', 'errorProne_1');
        expect(message.content).to.have.property('error').with.property('name', 'Always');
      });

      it('publishes catch message with source and error when delegated expected error is published', () => {
        const definition = ErrorEventDefinition(event, {
          type: 'bpmn:ErrorEventDefinition',
          behaviour: {
            errorRef: {
              id: 'error_1',
            },
          },
        });

        let message;
        event.broker.subscribeOnce('event', 'activity.catch', (_, msg) => {
          message = msg;
        });

        definition.execute({
          fields: {},
          content: {
            id: 'bound',
            executionId: 'bound_1_0',
            index: 0,
            parent: {
              id: 'bound',
              executionId: 'bound_1',
              path: [{
                id: 'process_1'
              }]
            },
          },
        });

        event.broker.publish('api', 'activity.throw.errorProne_1', {id: 'errorProne', executionId: 'errorProne_1', message: {
          id: 'error_1',
        }});

        expect(message).to.be.ok;

        expect(message).to.have.property('content').with.property('id', 'bound');
        expect(message.content).to.have.property('executionId', 'bound_1');
        expect(message.content.parent).to.have.property('id', 'process_1');
        expect(message.content).to.have.property('source').with.property('id', 'errorProne');
        expect(message.content.source).to.have.property('executionId', 'errorProne_1');
        expect(message.content).to.have.property('error').with.property('id', 'error_1');
      });

      it('ignored when delegated error id doesn´t match', () => {
        const definition = ErrorEventDefinition(event, {
          type: 'bpmn:ErrorEventDefinition',
          behaviour: {
            errorRef: {
              id: 'error_1',
            },
          },
        });

        let message;
        event.broker.subscribeOnce('event', 'activity.catch', (_, msg) => {
          message = msg;
        });

        definition.execute({
          fields: {},
          content: {
            id: 'bound',
            executionId: 'bound_1_0',
            index: 0,
            parent: {
              id: 'bound',
              executionId: 'bound_1',
              path: [{
                id: 'process_1'
              }]
            },
          },
        });

        event.broker.publish('api', 'activity.throw.errorProne_1', {id: 'errorProne', executionId: 'errorProne_1', error: {
          id: 'error_2',
        }});

        expect(message).to.not.be.ok;
      });

      it('ignored if exepecting known error and an anonymous error is delegated', () => {
        const definition = ErrorEventDefinition(event, {
          type: 'bpmn:ErrorEventDefinition',
          behaviour: {
            errorRef: {
              id: 'error_1',
            },
          },
        });

        let message;
        event.broker.subscribeOnce('event', 'activity.catch', (_, msg) => {
          message = msg;
        });

        definition.execute({
          fields: {},
          content: {
            id: 'bound',
            executionId: 'bound_1_0',
            index: 0,
            parent: {
              id: 'bound',
              executionId: 'bound_1',
              path: [{
                id: 'process_1'
              }]
            },
          },
        });

        event.broker.publish('api', 'activity.throw.errorProne_1', {id: 'errorProne', executionId: 'errorProne_1', error: {
          name: 'Anonymous',
        }});

        expect(message).to.not.be.ok;
      });
    });
  });

  describe('throw', () => {
    let event, bpmnError;
    beforeEach(() => {
      const environment = Environment();
      bpmnError = BpmnError({
        id: 'Error_0',
        type: 'bpmn:Error',
        name: 'KnownError',
        behaviour: {
          errorCode: '${environment.variables.errorCode}',
        },
        debug() {},
      }, { environment });

      event = {
        id: 'end',
        type: 'bpmn:EndEvent',
        broker: ActivityBroker(this).broker,
        environment,
        isThrowing: true,
        getActivityById(id) {
          if (id !== 'Error_0') return;
          return bpmnError;
        },
      };
    });

    it('publishes delegated throw event on execute', () => {
      event.environment.variables.errorCode = 'ERR_CODE';
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {
          errorRef: {
            id: 'Error_0',
          },
        },
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'end_1_0',
          parent: {
            id: 'end',
            executionId: 'end_1',
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.throw');
      expect(messages[0].properties).to.have.property('delegate', true);
      expect(messages[0].content).to.have.property('message').that.have.property('id', 'Error_0');
      expect(messages[0].content).to.have.property('message').that.have.property('code', 'ERR_CODE');
      expect(messages[0].content).to.have.property('message').that.have.property('name', 'KnownError');
    });

    it('without error reference publishes delegated throw event on execute', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {},
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'end_1_0',
          parent: {
            id: 'end',
            executionId: 'end_1',
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.throw');
      expect(messages[0].properties).to.have.property('delegate', true);
      expect(messages[0].content).to.have.property('message').that.have.property('name', 'anonymous');
    });

    it('with non-existing error reference publishes activity error on execute', () => {
      const definition = ErrorEventDefinition(event, {
        type: 'bpmn:ErrorEventDefinition',
        behaviour: {
          errorRef: {
            id: 'non-existing',
          },
        },
      });

      const messages = [];
      event.broker.subscribeTmp('event', 'activity.*', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.execute({
        fields: {},
        content: {
          executionId: 'end_1_0',
          parent: {
            id: 'end',
            executionId: 'end_1',
          },
        },
      });

      expect(messages).to.have.length(1);
      expect(messages[0].fields).to.have.property('routingKey', 'activity.throw');
      expect(messages[0].properties).to.have.property('delegate', true);
      expect(messages[0].content).to.have.property('message').that.have.property('id', 'non-existing');
    });
  });
});
