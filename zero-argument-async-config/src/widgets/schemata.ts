import * as Gadgets from './gadgets';
import * as Gizmos from './gizmos';

export enum FactoryType {
  gadgets = 'gadgets',
  gizmos = 'gizmos',
}

export type SomePartial<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

export interface IServiceConfig {
  gadgets: Gadgets.IServiceConfig;
  gizmos: Gizmos.IServiceConfig;
}

export interface IServiceOptions {
  config: IServiceConfig;
  factoryType: FactoryType;
}
