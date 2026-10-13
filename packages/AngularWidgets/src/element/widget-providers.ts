/**
 * Dependency injection providers for the ballot widget.
 *
 * Configures the Angular standalone application with the services
 * and settings needed for the ballot element to function.
 */

import { Provider } from '@angular/core';
import type { BallotApiConfig } from './element-attributes';

/** Token for providing the ballot API config. */
const BALLOT_CONFIG_TOKEN = 'BallotApiConfig';

/**
 * Create providers for the ballot widget application.
 *
 * @param config - The API configuration from element attributes
 * @returns An array of DI providers
 */
export function ballotWidgetProviders(config: BallotApiConfig): Provider[] {
  return [
    // Provide the config as an injectable singleton
    {
      provide: BALLOT_CONFIG_TOKEN,
      useValue: config,
    },
  ];
}
