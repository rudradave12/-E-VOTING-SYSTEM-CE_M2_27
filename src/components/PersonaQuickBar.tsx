/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { VoterRecord } from '../types';

export interface PersonaQuickBarProps {
  onSelectPersona?: (persona: VoterRecord) => void;
  activeEpicId?: string;
}

/**
 * @deprecated Phase 01: Preloaded demo voter personas have been removed from the
 * normal user journey. Voter verification is strictly fail-closed via the backend
 * and does not present preconfigured sample electors.
 */
export const PersonaQuickBar: React.FC<PersonaQuickBarProps> = () => {
  return null;
};
