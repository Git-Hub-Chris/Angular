/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {
  assertInInjectionContext,
  resource,
  ResourceLoaderParams,
  ResourceRef,
  Signal,
  signal,
  BaseResourceOptions,
} from '@angular/core';
import {Observable, Subscription} from 'rxjs';

/**
 * Like `ResourceOptions` but uses an RxJS-based `loader`.
 *
 * @experimental
 */
export interface RxResourceOptions<T, R> extends BaseResourceOptions<T, R> {
  loader: (params: ResourceLoaderParams<R>) => Observable<T>;
}

/**
 * Like `resource` but uses an RxJS based `loader` which maps the request to an `Observable` of the
 * resource's value.
 *
 * @experimental
 */
export function rxResource<T, R>(
  opts: RxResourceOptions<T, R> & {defaultValue: NoInfer<T>},
): ResourceRef<T>;

/**
 * Like `resource` but uses an RxJS based `loader` which maps the request to an `Observable` of the
 * resource's value.
 *
 * @experimental
 */
export function rxResource<T, R>(opts: RxResourceOptions<T, R>): ResourceRef<T | undefined>;
export function rxResource<T, R>(opts: RxResourceOptions<T, R>): ResourceRef<T | undefined> {
  opts?.injector || assertInInjectionContext(rxResource);
  return resource<T, R>({
    ...opts,
    stream: (params) => {
      let sub: Subscription;

      // Track the abort listener so it can be removed if the Observable completes (as a memory
      // optimization).
      const onAbort = () => sub.unsubscribe();
      params.abortSignal.addEventListener('abort', onAbort);

      // Start off stream as undefined.
      const stream = signal<{value: T} | {error: unknown}>({value: undefined as T});
      let resolve: ((value: Signal<{value: T} | {error: unknown}>) => void) | undefined;
      const promise = new Promise<Signal<{value: T} | {error: unknown}>>((r) => (resolve = r));

      function send(value: {value: T} | {error: unknown}): void {
        stream.set(value);
        resolve?.(stream);
        resolve = undefined;
      }

      sub = opts.loader(params).subscribe({
        next: (value) => send({value}),
        error: (error) => {
          send({error});
          // The observable terminates immediately when `error` is called,
          // and no further emissions or completion notifications occur.
          // Thus, we have to remove the `abort` listener in both
          // the `error` and `complete` notifications.
          params.abortSignal.removeEventListener('abort', onAbort);
        },
        complete: () => {
          if (resolve) {
            send({error: new Error('Resource completed before producing a value')});
          }
          params.abortSignal.removeEventListener('abort', onAbort);
        },
      });

      return promise;
    },
  });
}
