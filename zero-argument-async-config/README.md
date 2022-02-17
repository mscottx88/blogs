# Introduction

In this article, you will learn by example, a pattern for developing Typescript service layer classes that are capable of asynchronous, self-configuration. This powerful technique provides two amazing capabilities:

1. Zero arguments means it takes zero effort to stand-up a service that implements this pattern. For example:

```typescript
const authorization = await Authorization.new();
```

2. This pattern also makes it equally simple to compose multiple, arbitrarily nested services that implement this pattern. For example:

```typescript
const service = await Service.new();
```

> **Note** What's the difference? Only the return type! You cannot tell what service(s) either `Authorization` or `Service` uses or, for that matter, what service(s) those services may use and so on.

# Configuration Object

Assume your service has a few properties that it needs at instantiation time. Perhaps there is a service that it consumes and that service needs some properties to be instantiated. This configuration object will describe those properties.

For example purposes, assume the service has the following configuration:

```typescript
export interface IServiceConfig {
  authorization: Authorization.IServiceConfig;
  tableName: string;
  timeoutMS?: number;
  zone: number;
}
```

The fictitious properties above must be provided to the `constructor` at instantiation time.

> **Note** In this example, `authorization` is the container for the configuration for a nested service named `Authorization`.

Furthermore, the `Authorization` service being used by the service needs to be configured. Here is its configuration object as an example:

```typescript
export interface ICredentials {
  password: string;
  username: string;
}

export interface IServiceConfig {
  credentials: ICredentials;
  url: string;
}
```

> **Note** The properties of the `Authorization` service configuration will not be found in the code! They can only be obtained at runtime.

# Options Object

In addition to the configuration object, your service will also declare the options sent to the `constructor`. The `constructor` will accept at least one argument, the options object.

```typescript
export interface IServiceOptions {
  config: IServiceConfig;
}
```

> **Note** The `config` object is always present. Additional properties that are provided to the `constructor` would include those that cannot be determined automatically. These might be stateful parameters known only to the process running, for example.

# `getConfig`

Now that you've described the configuration of the service, create a `static` method that optionally accepts a `Partial` configuration and asynchronously resolves to a complete configuration. The idea here is you can influence the configuration - if you want to. Or, you can allow the system to configure itself. The choice is yours.

Here is an example of configuring the fictitious `Authorization` service:

```typescript
public static async getConfig(
  options: Partial<IServiceConfig> = {}
): Promise<IServiceConfig> {
  const { credentials, url = process.env.URL }: Partial<IServiceConfig> = options;

  if (!url) {
    throw new Error('Missing required configuration parameter url.');
  }

  return {
    credentials: await this.getCredentials(credentials),
    url,
  };
}
```

> **Note** The `options` object here is entirely optional. If it is provided, it is a `Partial` of the entire configuration object. In this way, you have the ability, but not the requirement to send the necessary configuration values.

# Nested `getConfig`

Here's where the power of zero argument, asynchronous configuration comes into play. Consider this example where the `Authorization` service is consumed by another service. This higher order service also implements the zero argument, asynchronous configuration pattern, as shown here:

```typescript
public static async getConfig(
  options: Partial<IServiceConfig> = {}
): Promise<IServiceConfig> {
  const {
    authorization,
    tableName = process.env.TABLE_NAME,
    timeoutMS = Infinity,
    zone = 0,
  }: Partial<IServiceConfig> = options;

  if (!tableName) {
    throw new Error('Missing required configuration parameter tableName.');
  }

  return {
    authorization: await Authorization.Service.getConfig(authorization),
    tableName,
    timeoutMS,
    zone
  };
}
```

> **Note** Notice that `authorization` is an optional parameter of the `getConfig` function. It is passed as-is to the `Authorization` service's `getConfig` function. If the parameter is not provided, then the lower level service configures itself entirely. If all or part of the parameter is provided, then the lower level service _completes_ the configuration!

This pattern can be repeated to any depth.

# `new` Factory

The final step is to create a `static` factory function that can asynchronously instantiate these services.

The `Authorization` service `new` factory example:

```typescript
public static async new(
  options: SomePartial<IServiceOptions, 'config'> = {}
): Promise<Authorization> {
  const { config, ...rest }: SomePartial<IServiceOptions, 'config'> = options;
  return new this({ config: await this.getConfig(config), ...rest });
}
```

> **Note** `SomePartial` is a helper type that allows you to declare what properties are to be made optional.

```typescript
export type SomePartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
```

Finally, the higher order service consuming the fictitious `Authorization` service also has a `new` factory. For example:

```typescript
public static async new(
  options: SomePartial<IServiceOptions, 'config'> = {}
): Promise<Service> {
  const { config, ...rest }: SomePartial<IServiceOptions, 'config'> = options;
  return new this({ config: await this.getConfig(config), ...rest });
}
```

> **Note** What is the difference between these two factories? Only the return type!

These two factories both accept the options that are sent to their respective `constructor` functions.

One option is the optional `config` object and the remaining options, if any, are captured as `rest` arguments. If the configuration is omitted in part or whole it is _completed_ as needed and then the service is instantiated.
