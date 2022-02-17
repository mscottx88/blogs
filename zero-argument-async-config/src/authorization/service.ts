import { SomePartial } from 'src/widgets';
import { ICredentials, IServiceConfig, IServiceOptions } from './schemata';

export class Authorization {
  public static async getConfig(
    options: Partial<IServiceConfig> = {}
  ): Promise<IServiceConfig> {
    const { credentials, url = process.env.URL }: Partial<IServiceConfig> =
      options;

    if (!url) {
      throw new Error('Missing required configuration parameter url.');
    }

    return {
      credentials: await this.getCredentials(credentials),
      url,
    };
  }

  public static async getCredentials(
    options: Partial<ICredentials> = {}
  ): Promise<ICredentials> {
    const { password, username }: Partial<ICredentials> = options;

    return {
      password: password || 'some-password',
      username: username || 'some-username',
    };
  }

  public static async new(
    options: SomePartial<IServiceOptions, 'config'> = {}
  ): Promise<Authorization> {
    const { config, ...rest }: SomePartial<IServiceOptions, 'config'> = options;
    return new this({ config: await this.getConfig(config), ...rest });
  }

  #credentials: ICredentials;
  public readonly url: string;

  constructor(options: IServiceOptions) {
    const { config }: IServiceOptions = options;
    const { credentials, url }: IServiceConfig = config;

    this.#credentials = credentials;
    this.url = url;
  }
}

export { Authorization as Service };
