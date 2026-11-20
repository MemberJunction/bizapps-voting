/**
 * Dependency injection providers for the ballot widget.
 *
 * Configures the Angular standalone application with the services
 * and settings needed for the ballot element to function.
 */

import { InjectionToken, Provider } from '@angular/core';
import type { BallotApiConfig } from './element-attributes';

/** Token for the ballot API config (read from the element's attributes). */
export const BALLOT_CONFIG = new InjectionToken<BallotApiConfig>('BallotApiConfig');

/**
 * Create providers for the ballot widget application.
 *
 * @param config - The API configuration from element attributes
 * @returns An array of DI providers
 */
export function ballotWidgetProviders(config: BallotApiConfig): Provider[] {
  return [{ provide: BALLOT_CONFIG, useValue: config }];
}
