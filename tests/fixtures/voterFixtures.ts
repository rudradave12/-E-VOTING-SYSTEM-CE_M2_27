/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VoterRecord } from '../../frontend/src/types';

/**
 * Isolated test fixtures for automated testing only.
 * 
 * IMPORTANT:
 * - This file MUST ONLY be imported in test files (*.test.ts).
 * - Production and development application server initialization MUST NEVER
 *   import or seed these fixtures.
 * - In normal runtime, preloaded demo voters have been removed (Phase 01).
 */
export const TEST_VOTERS: VoterRecord[] = [
  {
    id: 'voter-01',
    epicId: 'IND-DL-982341',
    name: 'Rajesh Kumar Sharma',
    gender: 'M',
    age: 38,
    constituencyId: 'CONST-04-ND',
    pollingStation: 'Room 4, Govt Boys Senior Sec School, Connaught Place',
    maskedMobile: '+91 ••••• •4589',
    isEligible: true,
    status: 'ELIGIBLE',
  },
  {
    id: 'voter-02',
    epicId: 'IND-DL-339210',
    name: 'Priya Ananthakrishnan',
    gender: 'F',
    age: 29,
    constituencyId: 'CONST-04-ND',
    pollingStation: 'Auditorium, Lodhi Estate Community Centre',
    maskedMobile: '+91 ••••• •8821',
    isEligible: true,
    status: 'ELIGIBLE',
  },
  {
    id: 'voter-03',
    epicId: 'IND-UP-441209',
    name: 'Amit Vikram Singh',
    gender: 'M',
    age: 45,
    constituencyId: 'CONST-77-VAR',
    pollingStation: 'Main Hall, Dashashwamedh Civic School, Varanasi',
    maskedMobile: '+91 ••••• •3312',
    isEligible: true,
    status: 'ELIGIBLE',
  },
  {
    id: 'voter-04',
    epicId: 'IND-KL-772183',
    name: 'Anjali Mary Thomas',
    gender: 'F',
    age: 32,
    constituencyId: 'CONST-04-WAY',
    pollingStation: 'St. Joseph Higher Secondary School, Kalpetta',
    maskedMobile: '+91 ••••• •9901',
    isEligible: true,
    status: 'ELIGIBLE',
  },
  {
    id: 'voter-05',
    epicId: 'IND-KA-550912',
    name: 'Karthik S. Murthy',
    gender: 'M',
    age: 27,
    constituencyId: 'CONST-26-BLR',
    pollingStation: 'Jayanagar 4th Block Community Hall, Bangalore',
    maskedMobile: '+91 ••••• •1294',
    isEligible: true,
    status: 'ELIGIBLE',
  },
  {
    id: 'voter-06',
    epicId: 'IND-DL-999000',
    name: 'Sunita Devi (Ineligible Test Case)',
    gender: 'F',
    age: 17,
    constituencyId: 'CONST-04-ND',
    pollingStation: 'Not Assigned',
    maskedMobile: '+91 ••••• •0000',
    isEligible: false,
    status: 'ELIGIBLE',
  },
];
