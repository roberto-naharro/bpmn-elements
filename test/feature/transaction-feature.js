import Definition from '../../src/definition/Definition';
import factory from '../helpers/factory';
import testHelpers from '../helpers/testHelpers';

const transactionSource = factory.resource('transaction.bpmn');

Feature('Transaction', () => {
  Scenario('A transaction with compensation and a cancel boundary event', () => {
    let definition;
    const undoService = [];
    const options = {
      services: {
        compare(answer, str) {
          return answer === str;
        },
        compensate(...args) {
          undoService.push(args);
        }
      },
      extensions: {
        me({broker}, {environment}) {
          broker.subscribeTmp('event', 'activity.#', (routingKey, {content}) => {
            switch (routingKey) {
              case 'activity.end': {
                if ('output' in content) environment.output[content.id] = content.output;
                break;
              }
            }
          }, {noAck: true, consumerTag: 'save-output-tag'});
        }
      }
    };

    Given('a transaction a user task monitored by cancel- and error-listener', async () => {
      const context = await testHelpers.context(transactionSource);
      definition = Definition(context, options);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let userTask;
    Then('the transaction waits for user input', () => {
      const transaction = definition.getPostponed().find((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');

      userTask = transaction.getPostponed().pop();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'areUSure');
    });

    And('compensation service is not started', () => {
      expect(undoService).to.have.length(0);
    });

    When('user decides to cancel', () => {
      userTask.signal('No');
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    let undoCallback;
    And('it has the execute complete data from the service task', () => {
      [, undoCallback] = undoService.pop();
    });

    When('compensation service completes', () => {
      undoCallback(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    And('cancel was triggered', () => {
      const canceled = definition.getActivityById('canceled');
      expect(canceled.counters).to.have.property('taken', 1);
      expect(canceled.counters).to.have.property('discarded', 0);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('the transaction again waits for user input', () => {
      const transaction = definition.getPostponed().find((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');

      userTask = transaction.getPostponed().pop();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'areUSure');
    });

    And('compensation service is not started', () => {
      expect(undoService).to.have.length(0);
    });

    When('user decides to continue', () => {
      userTask.signal('Yes');
    });

    Then('definition completes', () => {
      return end;
    });

    And('cancel was not triggered', () => {
      const canceled = definition.getActivityById('canceled');
      expect(canceled.counters).to.have.property('taken', 1);
      expect(canceled.counters).to.have.property('discarded', 1);
    });

    Given('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('definition is stopped', () => {
      definition.stop();
    });

    When('resumed', () => {
      definition.resume();
    });

    Then('user input is expected', () => {
      const transaction = definition.getPostponed().find((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');
      userTask = transaction.getPostponed().pop();
      expect(userTask).to.have.property('id', 'areUSure');
    });

    When('user decides to cancel', () => {
      userTask.signal('No');
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    When('compensated', () => {
      undoService.pop()[1]();
    });

    Then('definition completes', () => {
      return end;
    });

    And('cancel was triggered', () => {
      const canceled = definition.getActivityById('canceled');
      expect(canceled.counters).to.have.property('taken', 2);
      expect(canceled.counters).to.have.property('discarded', 1);
    });

    Given('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('definition is stopped', () => {
      definition.stop();
    });

    let recovered;
    When('recovered with state', async () => {
      const context = await testHelpers.context(transactionSource);
      recovered = Definition(context, options).recover(definition.getState());

      end = recovered.waitFor('end');
      recovered.resume();
    });

    Then('user input is expected', () => {
      const transaction = recovered.getPostponed().find((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');
      userTask = transaction.getPostponed().pop();
      expect(userTask).to.have.property('id', 'areUSure');
    });

    When('user decides to cancel', () => {
      userTask.signal('No');
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    When('compensated', () => {
      undoService.pop()[1]();
    });

    Then('recovered definition completes', () => {
      return end;
    });

    And('cancel was triggered', () => {
      const canceled = recovered.getActivityById('canceled');
      expect(canceled.counters).to.have.property('taken', 3);
      expect(canceled.counters).to.have.property('discarded', 1);
    });
  });

  Scenario('A transaction with compensation and a error boundary event', () => {
    let definition;
    const undoService = [];
    const options = {
      services: {
        compare(answer, str) {
          return answer === str;
        },
        compensate(...args) {
          undoService.push(args);
        }
      },
      extensions: {
        me({broker}, {environment}) {
          broker.subscribeTmp('event', 'activity.#', (routingKey, {content}) => {
            switch (routingKey) {
              case 'activity.end': {
                if ('output' in content) environment.output[content.id] = content.output;
                break;
              }
            }
          }, {noAck: true, consumerTag: 'save-output-tag'});
        }
      }
    };

    Given('a transaction a user task monitored by cancel- and error-listener', async () => {
      const context = await testHelpers.context(transactionSource);
      definition = Definition(context, options);
    });

    let end;
    When('definition is ran', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    let userTask;
    Then('the transaction waits for user input', () => {
      const transaction = definition.getPostponed().find((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');

      userTask = transaction.getPostponed().pop();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'areUSure');
    });

    And('compensation service is not started', () => {
      expect(undoService).to.have.length(0);
    });

    When('user decides to abort', () => {
      userTask.signal('abort');
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    let undoCallback;
    And('it has the execute complete data from the service task', () => {
      [, undoCallback] = undoService.pop();
    });

    When('compensation service completes', () => {
      undoCallback(null, true);
    });

    Then('definition completes', () => {
      return end;
    });

    And('error was triggered', () => {
      const errored = definition.getActivityById('errored');
      expect(errored.counters).to.have.property('taken', 1);
      expect(errored.counters).to.have.property('discarded', 0);
    });

    And('cancel listener was discarded', () => {
      const canceled = definition.getActivityById('canceled');
      expect(canceled.counters).to.have.property('taken', 0);
      expect(canceled.counters).to.have.property('discarded', 1);
    });

    When('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    Then('the transaction again waits for user input', () => {
      const transaction = definition.getPostponed().find((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');

      userTask = transaction.getPostponed().pop();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'areUSure');
    });

    And('compensation service is not started', () => {
      expect(undoService).to.have.length(0);
    });

    When('user decides to continue', () => {
      userTask.signal('Yes');
    });

    Then('definition completes', () => {
      return end;
    });

    And('error was not triggered', () => {
      const errored = definition.getActivityById('errored');
      expect(errored.counters).to.have.property('taken', 1);
      expect(errored.counters).to.have.property('discarded', 1);
    });

    And('cancel was not triggered', () => {
      const canceled = definition.getActivityById('canceled');
      expect(canceled.counters).to.have.property('taken', 0);
      expect(canceled.counters).to.have.property('discarded', 2);
    });

    Given('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('definition is stopped', () => {
      definition.stop();
    });

    When('resumed', () => {
      definition.resume();
    });

    Then('user input is expected', () => {
      const transaction = definition.getPostponed().find((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');
      userTask = transaction.getPostponed().pop();
      expect(userTask).to.have.property('id', 'areUSure');
    });

    When('user decides to cancel', () => {
      userTask.signal('abort');
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    When('compensated', () => {
      undoService.pop()[1]();
    });

    Then('definition completes', () => {
      return end;
    });

    And('error was triggered', () => {
      const errored = definition.getActivityById('errored');
      expect(errored.counters).to.have.property('taken', 2);
      expect(errored.counters).to.have.property('discarded', 1);
    });

    And('cancel was not triggered', () => {
      const canceled = definition.getActivityById('canceled');
      expect(canceled.counters).to.have.property('taken', 0);
      expect(canceled.counters).to.have.property('discarded', 3);
    });

    Given('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();
    });

    And('definition is stopped', () => {
      definition.stop();
    });

    let recovered;
    When('recovered with state', async () => {
      const context = await testHelpers.context(transactionSource);
      recovered = Definition(context, options).recover(definition.getState());

      end = recovered.waitFor('end');
      recovered.resume();
    });

    Then('user input is expected', () => {
      const transaction = recovered.getPostponed().find((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');
      userTask = transaction.getPostponed().pop();
      expect(userTask).to.have.property('id', 'areUSure');
    });

    When('user decides to abort', () => {
      userTask.signal('abort');
    });

    Then('compensation service is waiting for callback', () => {
      expect(undoService).to.have.length(1);
    });

    When('compensated', () => {
      undoService.pop()[1]();
    });

    Then('recovered definition completes', () => {
      return end;
    });

    And('error was triggered', () => {
      const errored = recovered.getActivityById('errored');
      expect(errored.counters).to.have.property('taken', 3);
      expect(errored.counters).to.have.property('discarded', 1);
    });

    And('cancel was not triggered', () => {
      const canceled = recovered.getActivityById('canceled');
      expect(canceled.counters).to.have.property('taken', 0);
      expect(canceled.counters).to.have.property('discarded', 4);
    });
  });

  Scenario('Combined cancel- and error-listener', () => {
    let context;
    Given('a transaction monitored by combined error and cancel listeners', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def" targetNamespace="http://bpmn.io/schema/bpmn">
        <process id="theProcess" isExecutable="true">
          <transaction id="atomic">
            <startEvent id="start" />
            <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
            <sequenceFlow id="flow2" sourceRef="start" targetRef="cancelTask" />
            <userTask id="task" />
            <boundaryEvent id="comp" cancelActivity="true" attachedToRef="task">
              <compensateEventDefinition />
            </boundaryEvent>
            <association id="association" sourceRef="comp" targetRef="compensate" />
            <task id="compensate" isForCompensation="true" />
            <userTask id="cancelTask" />
            <sequenceFlow id="flow3" sourceRef="task" targetRef="end" />
            <sequenceFlow id="flow4" sourceRef="cancelTask" targetRef="cancelEnd" />
            <endEvent id="end" />
            <endEvent id="cancelEnd">
              <cancelEventDefinition />
            </endEvent>
          </transaction>
          <boundaryEvent id="bound" attachedToRef="atomic">
            <cancelEventDefinition />
            <errorEventDefinition />
          </boundaryEvent>
        </process>
      </definitions>`;
      context = await testHelpers.context(source);
    });

    let definition, end;
    When('definition is ran', () => {
      definition = Definition(context);
      end = definition.waitFor('end');
      definition.run();
    });

    let userTask, cancelTask, transaction;
    Then('the transaction waits for user input', () => {
      transaction = definition.getPostponed().find((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');

      [,, userTask, cancelTask] = transaction.getPostponed();

      expect(transaction.content).to.have.property('isTransaction', true);

      expect(userTask).to.have.property('id', 'task');
      expect(cancelTask).to.have.property('id', 'cancelTask');
    });

    When('user decides to continue', () => {
      userTask.signal();
      cancelTask.discard();
    });

    Then('definition completes', () => {
      return end;
    });

    And('transaction completed', () => {
      const atomic = definition.getActivityById('atomic');
      expect(atomic.counters).to.have.property('discarded', 0);
      expect(atomic.counters).to.have.property('taken', 1);
    });

    And('combined listener was discarded', () => {
      const bound = definition.getActivityById('bound');
      expect(bound.counters).to.have.property('discarded', 1);
      expect(bound.counters).to.have.property('taken', 0);
    });

    Given('definition is ran again', () => {
      end = definition.waitFor('end');
      definition.run();

      transaction = definition.getPostponed().find((e) => e.id === 'atomic');
      expect(transaction).to.have.property('id', 'atomic');
      [,, userTask, cancelTask] = transaction.getPostponed();

      expect(userTask).to.have.property('id', 'task');
      expect(cancelTask).to.have.property('id', 'cancelTask');
    });

    When('transaction is canceled', () => {
      cancelTask.signal();
    });

    Then('definition completes again', () => {
      return end;
    });

    And('transaction completed', () => {
      const atomic = definition.getActivityById('atomic');
      expect(atomic.counters).to.have.property('discarded', 0);
      expect(atomic.counters).to.have.property('taken', 2);
    });

    And('combined listener was taken', () => {
      const bound = definition.getActivityById('bound');
      expect(bound.counters).to.have.property('discarded', 1);
      expect(bound.counters).to.have.property('taken', 1);
    });
  });
});
