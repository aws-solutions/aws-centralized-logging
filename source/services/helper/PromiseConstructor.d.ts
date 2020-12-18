/**
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
export interface PromiseResolution<T> {
  status: "fulfilled";
  value: T;
}

export interface PromiseRejection<E> {
  status: "rejected";
  reason: E;
}

export type PromiseResult<T, E = unknown> =
  | PromiseResolution<T>
  | PromiseRejection<E>;

export type PromiseList<T extends [unknown, ...unknown[]]> = {
  [P in keyof T]: Promise<T[P]>;
};

export type PromiseResultList<T extends [unknown, ...unknown[]]> = {
  [P in keyof T]: PromiseResult<T[P]>;
};

declare global {
  interface PromiseConstructor {
    allSettled(): Promise<[]>;
    allSettled<T extends [unknown, ...unknown[]]>(
      list: PromiseList<T>
    ): Promise<PromiseResultList<T>>;
    allSettled<T>(iterable: Iterable<T>): Promise<Array<PromiseResult<T>>>;
  }
}
