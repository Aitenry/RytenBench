import React from 'react'

type ProviderTuple<P = any> =
  [React.ComponentType<P>, P?] | [React.ComponentType<{ children: React.ReactNode }>]

/**
 * 将多个 Provider 组合为一个，消除嵌套层级
 * @example
 * const AppProviders = composeProviders(
 *   [ProviderA, { value: someValue }],
 *   [ProviderB],
 * )
 */
export function composeProviders(
  ...providers: ProviderTuple[]
): React.FC<{ children: React.ReactNode }> {
  return ({ children }) =>
    providers.reduceRight(
      (acc, [Provider, props = {}]) => <Provider {...props}>{acc}</Provider>,
      children
    )
}
