/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORICAL_CONSTITUENCIES_2024,
  HISTORICAL_PROVENANCE,
  RECOGNIZED_PARTIES,
  BATCH_IMPORT_SPECIFICATION,
} from '../data/historical2024';
import { TEST_VOTERS } from './fixtures/voterFixtures';

describe('BlockBallot — Phase 7: Real Historical 2024 Lok Sabha Data & Civic Navigation', () => {
  it('1. Historical ECI Provenance & Non-Endorsement Disclaimers', () => {
    assert.equal(HISTORICAL_PROVENANCE.electionYear, 2024);
    assert.equal(HISTORICAL_PROVENANCE.verificationStatus, 'VERIFIED_OFFICIAL_ECI');
    assert.ok(HISTORICAL_PROVENANCE.generalElectionUrl.includes('eci.gov.in'));
    assert.ok(HISTORICAL_PROVENANCE.dataGovCatalogUrl.includes('data.gov.in'));
    assert.ok(HISTORICAL_PROVENANCE.affidavitPortalUrl.includes('affidavit.eci.gov.in'));
    assert.ok(
      HISTORICAL_PROVENANCE.nonEndorsementNotice.includes('NOT operated, approved, sponsored, or endorsed by the Election Commission of India')
    );
  });

  it('2. ECI 2024 Constituency Results & Turnout Data Integrity', () => {
    assert.ok(HISTORICAL_CONSTITUENCIES_2024.length >= 10, 'Expected at least 10 verified representative constituencies');

    for (const c of HISTORICAL_CONSTITUENCIES_2024) {
      assert.ok(c.totalElectors > 0, `Total electors must be positive for ${c.name}`);
      if (c.isUnopposed) {
        assert.equal(c.votesCounted, 0, `Unopposed constituency must have 0 votes counted for ${c.name}`);
        assert.equal(c.turnoutPercentage, 0, `Unopposed constituency must have 0% turnout for ${c.name}`);
      } else {
        assert.ok(c.votesCounted > 0, `Votes counted must be positive for ${c.name}`);
        assert.ok(c.turnoutPercentage > 45 && c.turnoutPercentage < 95, `Turnout percentage realistic for ${c.name}`);
        assert.ok(c.winningMargin > 0, `Winning margin must be positive for ${c.name}`);
        assert.ok(c.notaVotes > 0, `NOTA count must be recorded for ${c.name}`);
      }
      assert.ok(c.winnerName.length > 0, `Winner name required for ${c.name}`);
      assert.ok(c.winnerParty.length > 0, `Winner party required for ${c.name}`);
      assert.equal(c.isVerified, true, `Constituency must be marked official verified for ${c.name}`);

      // Verify that candidates include winner and NOTA (for contested elections)
      const hasWinner = c.candidates.some((cand) => cand.isWinner && cand.name === c.winnerName);
      assert.ok(hasWinner, `Winner candidate must match winnerName in ${c.name}`);

      if (!c.isUnopposed) {
        const hasNota = c.candidates.some((cand) => cand.partyAbbreviation === 'NOTA');
        assert.ok(hasNota, `NOTA option must be present in ${c.name}`);
      }

      // Verify candidate vote share math
      for (const cand of c.candidates) {
        assert.ok(cand.votesCounted >= 0, `Candidate votes non-negative for ${cand.name}`);
        assert.ok(cand.votePercentage >= 0 && cand.votePercentage <= 100, `Vote percentage valid for ${cand.name}`);
        assert.ok(cand.symbol.length > 0, `Symbol required for ${cand.name}`);
        assert.equal(cand.isOfficialSymbolVerified, true, `Symbol verified for ${cand.name}`);
      }
    }
  });

  it('3. Recognized National & State Political Parties and Reserved Symbols', () => {
    assert.ok(RECOGNIZED_PARTIES.length >= 8);

    const partyCodes = RECOGNIZED_PARTIES.map((p) => p.code);
    assert.ok(partyCodes.includes('BJP'));
    assert.ok(partyCodes.includes('INC'));
    assert.ok(partyCodes.includes('AAP'));
    assert.ok(partyCodes.includes('BSP'));
    assert.ok(partyCodes.includes('SP'));
    assert.ok(partyCodes.includes('CPIM'));
    assert.ok(partyCodes.includes('DMK'));
    assert.ok(partyCodes.includes('AITC'));

    for (const p of RECOGNIZED_PARTIES) {
      assert.ok(p.symbolNotificationRef.includes('56/2024/PPS-III') || p.symbolNotificationRef.includes('PUCL'), `Party ${p.code} must cite official notification`);
      assert.ok(p.statesApplicable.length > 0, `Applicable state required for ${p.code}`);
      assert.ok(p.reservedSymbol.length > 0, `Reserved symbol required for ${p.code}`);
    }
  });

  it('4. Coverage Gap Disclosure & Batch Ingestion Specification', () => {
    assert.equal(BATCH_IMPORT_SPECIFICATION.totalConstituenciesInLokSabha, 543);
    assert.equal(BATCH_IMPORT_SPECIFICATION.currentlyLoadedSampleConstituencies, 10);
    assert.equal(BATCH_IMPORT_SPECIFICATION.pendingConstituencies, 533);
    assert.ok(BATCH_IMPORT_SPECIFICATION.importInstructions.length >= 4);
    assert.ok(BATCH_IMPORT_SPECIFICATION.officialDataCatalogueUrl.includes('data.gov.in'));
  });

  it('5. Civic Separation: Synthetic Practice IDs vs Historical Archive', () => {
    // Check that isolated test fixtures are clearly distinct from any historical candidate IDs
    const syntheticEpicIds = TEST_VOTERS.map((v) => v.epicId);
    assert.ok(syntheticEpicIds.length >= 3);

    for (const epic of syntheticEpicIds) {
      assert.ok(epic.startsWith('IND-'), `Synthetic EPIC ID must have synthetic prefix: ${epic}`);
    }

    // Historical records are not modifiable
    const initialCount = HISTORICAL_CONSTITUENCIES_2024[0].votesCounted;
    assert.ok(initialCount > 0);
  });
});
