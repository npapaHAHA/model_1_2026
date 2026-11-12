'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');

const appPath = path.join(__dirname, '..', 'Квантовая лаборатория.html');

function loadPhysics(filename) {
  const html = readFileSync(filename, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .filter((match) => match[1].includes('root.QuantumPhysics = api;'));
  assert.equal(scripts.length, 1, `Expected one embedded numerical core in ${filename}`);
  const context = { module: { exports: {} } };
  runInNewContext(scripts[0][1], context, { filename, timeout: 1000 });
  return context.module.exports;
}

function checkPhysics(physics) {
  function well(options) {
    const potential = physics.makePotential({ kind: 'well', ...options });
    const result = physics.solveWell({ maxStates: 30, ...options, potential });
    assert.ok(result.states.length > 0 && result.states.length <= result.totalStates);
    for (const state of result.states) {
      assert.ok(Number.isFinite(state.energy) && state.energy < options.exterior);
      assert.ok(state.psi.every(Number.isFinite));
    }
    return result;
  }

  function barrier(options) {
    const potential = physics.makePotential({ kind: 'barrier', ...options });
    const result = physics.solveBarrier({ ...options, potential });
    assert.ok(Number.isFinite(result.logTransmission));
    assert.ok(result.transmission >= 0 && result.transmission <= 1);
    assert.ok(Math.abs(result.transmission + result.reflection - 1) < 1e-14);
    if (options.preset === 'rectangular') {
      const exact = physics.rectangularTransmission(options);
      assert.ok(Math.abs(result.transmission / exact - 1) < 1e-10);
    }
    return result;
  }

  const standardWell = { width: 2.4, mass: 1, exterior: 1.6, height: 1.25, steps: 600 };
  const standardBarrier = { width: 1.2, mass: 1, height: .8, energy: .45, steps: 280 };
  const gaussian = { ...standardBarrier, preset: 'gaussian' };
  const results = {
    defaultWell: well({ ...standardWell, preset: 'asymmetric' }),
    defaultBarrier: barrier(gaussian),
    rectangleWell: well({ ...standardWell, preset: 'rectangular' }),
    rectangleBarrier: [.45, .8, 1.2].map((energy) => (
      barrier({ ...standardBarrier, preset: 'rectangular', energy })
    )),
    formulaWell: well({ ...standardWell, preset: 'expression', expression: '0.7*(2*x/a-1)^2+0.1*sin(pi*x/a)' }),
    formulaBarrier: barrier({ ...standardBarrier, preset: 'expression', expression: 'x < h/2 ? 0.4 : 0.15+0.25*x/h' }),
    tableWell: well({ ...standardWell, preset: 'table', table: 'x;U\n0;0.9\n0.4;0.1\n1.4;0.55\n2.4;0.8' }),
    tableBarrier: barrier({ ...standardBarrier, preset: 'table', table: 'x,U\n0,0.12\n0.4,0.8\n0.9,0.34\n1.2,0.12' }),
    highMassWell: well({ ...standardWell, preset: 'rectangular', mass: 5 }),
    highMassBarrier: barrier({ ...standardBarrier, preset: 'rectangular', width: 6, mass: 5, height: 5, energy: .01 }),
    defaultCurve: physics.barrierCurve({ ...gaussian, energyMax: 1.6, points: 281,
      potential: physics.makePotential({ ...gaussian, kind: 'barrier' }) }),
  };

  assert.equal(results.defaultWell.totalStates, 5);
  assert.equal(results.rectangleWell.totalStates, 5);
  assert.equal(results.highMassWell.totalStates, 12);
  assert.ok(Math.abs(results.defaultBarrier.transmission - .11868649008293962) < 1e-12);

  // Roots of the matching condition for a = 2.4 nm, U = 1.6 eV, and m = m_e.
  const exactLevels = [0.051190517319, 0.203964378654, 0.455573802577, 0.799760478569, 1.220499868472];
  assert.equal(results.rectangleWell.states.length, exactLevels.length);
  exactLevels.forEach((energy, index) => {
    assert.ok(Math.abs(results.rectangleWell.states[index].energy - energy) < 5.2e-5,
      `Rectangular well level ${index + 1} differs from the analytical reference`);
  });

  // Exact transmission at 0.45, 0.8 and 1.2 eV, below, at and above the barrier.
  const exactTransmission = [0.00272585671096, 0.116834842349, 0.866736743807];
  exactTransmission.forEach((transmission, index) => {
    assert.ok(Math.abs(results.rectangleBarrier[index].transmission - transmission) < 1e-10,
      `Rectangular barrier case ${index + 1} differs from the analytical reference`);
  });

  assert.equal(results.defaultCurve.length, 281);
  assert.equal(results.defaultCurve[0].logTransmission, -Infinity);
  assert.ok(results.defaultCurve.slice(1).every((point) => Number.isFinite(point.logTransmission)));
}

checkPhysics(loadPhysics(appPath));
console.log('OK: 12 well/barrier cases, analytical references and a 281-point energy curve');
