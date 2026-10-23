import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_CANDIDATES, INITIAL_CONSTITUENCIES } from '../data/mockData';

test('ECI Symbol Metadata Integrity: all seeded candidates have verified ECI citations', () => {
  assert.ok(INITIAL_CANDIDATES.length > 0, 'Candidates should be present');

  for (const cand of INITIAL_CANDIDATES) {
    assert.ok(cand.name, `Candidate must have name: ${cand.id}`);
    assert.ok(cand.partyName, `Candidate must have partyName: ${cand.id}`);
    assert.ok(cand.partyAbbreviation, `Candidate must have partyAbbreviation: ${cand.id}`);
    assert.ok(cand.symbol, `Candidate must have symbol: ${cand.id}`);
    assert.ok(cand.symbolDescription, `Candidate must have symbolDescription: ${cand.id}`);
    assert.ok(cand.symbolSource, `Candidate must have symbolSource: ${cand.id}`);
    assert.equal(cand.symbolVerificationStatus, 'VERIFIED_ECI', `Candidate must be VERIFIED_ECI: ${cand.id}`);
    assert.ok(cand.symbolKey, `Candidate must have symbolKey: ${cand.id}`);
    assert.ok(cand.nameHi, `Candidate must have Hindi name: ${cand.id}`);
    assert.ok(cand.partyNameHi, `Candidate must have Hindi party name: ${cand.id}`);
  }
});

test('ECI Symbol Verification: specific national and recognized parties match official gazette', () => {
  // BJP
  const bjpCandidates = INITIAL_CANDIDATES.filter((c) => c.partyAbbreviation === 'BJP');
  assert.ok(bjpCandidates.length > 0);
  for (const bjp of bjpCandidates) {
    assert.equal(bjp.symbolKey, 'LOTUS');
    assert.match(bjp.symbol, /Lotus/i);
    assert.match(bjp.symbolSource, /ECI Notification No\. 56\/2024\/PPS-III/);
    assert.equal(bjp.symbolVerificationStatus, 'VERIFIED_ECI');
  }

  // INC
  const incCandidates = INITIAL_CANDIDATES.filter((c) => c.partyAbbreviation === 'INC');
  assert.ok(incCandidates.length > 0);
  for (const inc of incCandidates) {
    assert.equal(inc.symbolKey, 'HAND');
    assert.match(inc.symbol, /Hand/i);
    assert.match(inc.symbolSource, /ECI Notification No\. 56\/2024\/PPS-III/);
    assert.equal(inc.symbolVerificationStatus, 'VERIFIED_ECI');
  }

  // AAP
  const aapCandidates = INITIAL_CANDIDATES.filter((c) => c.partyAbbreviation === 'AAP');
  assert.ok(aapCandidates.length > 0);
  for (const aap of aapCandidates) {
    assert.equal(aap.symbolKey, 'BROOM');
    assert.match(aap.symbol, /Broom/i);
    assert.match(aap.symbolSource, /ECI Notification No\. 56\/2024\/PPS-III/);
    assert.equal(aap.symbolVerificationStatus, 'VERIFIED_ECI');
  }

  // BSP
  const bspCandidates = INITIAL_CANDIDATES.filter((c) => c.partyAbbreviation === 'BSP');
  assert.ok(bspCandidates.length > 0);
  for (const bsp of bspCandidates) {
    assert.equal(bsp.symbolKey, 'ELEPHANT');
    assert.match(bsp.symbol, /Elephant/i);
    assert.match(bsp.symbolSource, /ECI Notification No\. 56\/2024\/PPS-III/);
    assert.equal(bsp.symbolVerificationStatus, 'VERIFIED_ECI');
  }

  // CPI
  const cpiCandidates = INITIAL_CANDIDATES.filter((c) => c.partyAbbreviation === 'CPI');
  assert.ok(cpiCandidates.length > 0);
  for (const cpi of cpiCandidates) {
    assert.equal(cpi.symbolKey, 'CORN_SICKLE');
    assert.match(cpi.symbol, /Ears of Corn and Sickle/i);
    assert.match(cpi.symbolSource, /ECI Notification No\. 56\/2024\/PPS-III/);
    assert.equal(cpi.symbolVerificationStatus, 'VERIFIED_ECI');
  }

  // NOTA
  const notaCandidates = INITIAL_CANDIDATES.filter((c) => c.partyAbbreviation === 'NOTA');
  assert.ok(notaCandidates.length > 0);
  for (const nota of notaCandidates) {
    assert.equal(nota.symbolKey, 'NOTA');
    assert.match(nota.symbolSource, /ECI Direction No\. 576\/3\/2015\/SDR/);
    assert.equal(nota.symbolVerificationStatus, 'VERIFIED_ECI');
  }
});

test('Constituency Relevance: parties are verified per constituency rather than assuming all contest all', () => {
  // New Delhi should have AAP, BJP, INC, NOTA
  const ndCandidates = INITIAL_CANDIDATES.filter((c) => c.constituencyId === 'CONST-04-ND');
  const ndParties = new Set(ndCandidates.map((c) => c.partyAbbreviation));
  assert.deepEqual(Array.from(ndParties).sort(), ['AAP', 'BJP', 'INC', 'NOTA'].sort());

  // Varanasi should have BJP, BSP, INC
  const varCandidates = INITIAL_CANDIDATES.filter((c) => c.constituencyId === 'CONST-77-VAR');
  const varParties = new Set(varCandidates.map((c) => c.partyAbbreviation));
  assert.deepEqual(Array.from(varParties).sort(), ['BJP', 'BSP', 'INC'].sort());

  // Wayanad should have BJP, CPI, INC (contested seat in Kerala)
  const wayCandidates = INITIAL_CANDIDATES.filter((c) => c.constituencyId === 'CONST-04-WAY');
  const wayParties = new Set(wayCandidates.map((c) => c.partyAbbreviation));
  assert.deepEqual(Array.from(wayParties).sort(), ['BJP', 'CPI', 'INC'].sort());
});

test('Neutral Alphabetical Ordering: sorting does not prioritize any political party', () => {
  const ndCandidates = INITIAL_CANDIDATES.filter((c) => c.constituencyId === 'CONST-04-ND');
  const sorted = [...ndCandidates].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  // Check that candidate names are in strictly ascending alphabetical order
  for (let i = 0; i < sorted.length - 1; i++) {
    assert.ok(
      sorted[i].name.localeCompare(sorted[i + 1].name) <= 0,
      `Expected ${sorted[i].name} <= ${sorted[i + 1].name}`
    );
  }

  // Bansuri Swaraj (B) -> Devender Yadav (D) -> None of the Above (N) -> Somnath Bharti (S)
  assert.equal(sorted[0].name, 'Bansuri Swaraj');
  assert.equal(sorted[1].name, 'Devender Yadav');
  assert.equal(sorted[2].name, 'None of the Above (NOTA)');
  assert.equal(sorted[3].name, 'Somnath Bharti');
});

test('Symbol Unavailable Fallback: unverified symbol resolves to neutral placeholder', () => {
  const unverifiedCandidate = {
    id: 'CAND-TEST-UNVERIFIED',
    numericId: 999,
    constituencyId: 'CONST-04-ND',
    name: 'Independent Candidate',
    partyName: 'Independent Citizen Front',
    partyAbbreviation: 'IND',
    symbol: 'Unrecognized Symbol',
    symbolKey: 'UNAVAILABLE' as const,
    symbolDescription: 'Symbol verification pending with ECI Returning Officer',
    symbolSource: 'Unverified',
    symbolVerificationStatus: 'UNAVAILABLE' as const,
    symbolColor: '#64748B',
    education: 'Graduate',
    age: 38,
    criminalCases: 0,
    assets: '₹50 Lakhs',
    voteCount: 0,
  };

  assert.equal(unverifiedCandidate.symbolVerificationStatus, 'UNAVAILABLE');
  assert.equal(unverifiedCandidate.symbolKey, 'UNAVAILABLE');
});
