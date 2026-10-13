/**
 * The `<mj-ballot>` attribute contract: a single source of truth for both
 * `observedAttributes` and the config passed to component inputs.
 *
 * Each attribute has an effect: 'input' updates the running component's signal input,
 * 'rebuild' tears down and rebuilds the application (for connection config changes).
 */

export interface BallotApiConfig {
  apiRoot: string;
  /** Explicit `graphql-url` attribute; when absent the flow uses the info endpoint's GraphQLUrl, then `{origin}/` (MJ's default graphqlRootPath). Never derived from apiRoot. */
  graphqlUrl?: string;
  hostAssertion?: string;
  email?: string;
  /** Explicit ballot language; when absent the distribution's DefaultLanguage (else 'en') applies. */
  language?: string;
}

/**
 * Attribute effects: what happens when each attribute changes.
 * - 'input': hand the new value to the component as a signal input
 * - 'rebuild': tear down the app and rebuild (connection config changes)
 */
const ATTRIBUTE_EFFECTS = {
  slug: 'input',
  'api-root': 'rebuild',
  'graphql-url': 'rebuild',
  'host-assertion': 'rebuild',
  email: 'rebuild',
  language: 'input',
} as const satisfies Record<string, 'input' | 'rebuild'>;

export type ElementAttribute = keyof typeof ATTRIBUTE_EFFECTS;
export type AttributeEffect = (typeof ATTRIBUTE_EFFECTS)[ElementAttribute];

/** Exactly the attributes the element observes. */
export const ELEMENT_ATTRIBUTES = Object.keys(ATTRIBUTE_EFFECTS) as readonly ElementAttribute[];

/** What to do about a change to `name`. */
export function effectOf(name: string): AttributeEffect | undefined {
  return Object.prototype.hasOwnProperty.call(ATTRIBUTE_EFFECTS, name)
    ? ATTRIBUTE_EFFECTS[name as ElementAttribute]
    : undefined;
}

/** Every `input` attribute as `[input name, value]` for the component. */
export function inputsFromAttributes(read: (name: string) => string | null): Array<[ElementAttribute, string]> {
  return ELEMENT_ATTRIBUTES.filter((name) => ATTRIBUTE_EFFECTS[name] === 'input').map((name) => [
    name,
    read(name) ?? '',
  ]);
}

/** Build the connection config from the element's attributes. */
export function configFromAttributes(read: (name: string) => string | null): BallotApiConfig {
  const apiRoot = read('api-root') || `${typeof location !== 'undefined' ? location.origin : ''}/vote`;
  return {
    apiRoot,
    graphqlUrl: read('graphql-url') || undefined,
    hostAssertion: read('host-assertion') ?? undefined,
    email: read('email') ?? undefined,
    language: read('language') || undefined,
  };
}
