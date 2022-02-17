import { FactoryType, SomePartial } from '.';
import * as Base from './base';
import * as Gadgets from './gadgets';
import * as Gizmos from './gizmos';
import { IServiceConfig, IServiceOptions } from './schemata';

export class Widgets implements Base.Service {
  public static async getConfig(
    options: Partial<IServiceConfig> = {}
  ): Promise<IServiceConfig> {
    const { gadgets, gizmos }: Partial<IServiceConfig> = options;
    return {
      gadgets: await Gadgets.Service.getConfig(gadgets),
      gizmos: await Gizmos.Service.getConfig(gizmos),
    };
  }

  public static async new(
    options: SomePartial<IServiceOptions, 'config'>
  ): Promise<Widgets> {
    const { config, ...rest }: SomePartial<IServiceOptions, 'config'> = options;
    return new this({ config: await this.getConfig(config), ...rest });
  }

  public readonly adapter: Base.Service;
  public readonly config: Base.IServiceConfig;

  constructor(options: IServiceOptions) {
    const { config, factoryType }: IServiceOptions = options;
    const { gadgets, gizmos }: IServiceConfig = config;

    switch (factoryType) {
      case FactoryType.gadgets:
        this.config = gadgets;
        this.adapter = new Gadgets.Service({ config: gadgets });
        break;

      case FactoryType.gizmos:
        this.config = gizmos;
        this.adapter = new Gizmos.Service({ config: gizmos });
        break;
    }
  }

  public assemble(...args: Parameters<Base.Service['assemble']>): Promise<void> {
    return this.adapter.assemble(...args);
  }
}

export { Widgets as Service };
