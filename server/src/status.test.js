import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTemperature } from './status.js';

describe('classifyTemperature', () => {
  it('marks 2–8 inclusive as safe', () => {
    assert.equal(classifyTemperature(2), 'safe');
    assert.equal(classifyTemperature(5), 'safe');
    assert.equal(classifyTemperature(8), 'safe');
  });

  it('marks just-outside bands as warning', () => {
    assert.equal(classifyTemperature(1), 'warning');
    assert.equal(classifyTemperature(1.5), 'warning');
    assert.equal(classifyTemperature(1.99), 'warning');
    assert.equal(classifyTemperature(8.01), 'warning');
    assert.equal(classifyTemperature(9.5), 'warning');
    assert.equal(classifyTemperature(10), 'warning');
  });

  it('marks further excursions as critical', () => {
    assert.equal(classifyTemperature(0.99), 'critical');
    assert.equal(classifyTemperature(-2), 'critical');
    assert.equal(classifyTemperature(10.01), 'critical');
    assert.equal(classifyTemperature(18), 'critical');
  });
});
