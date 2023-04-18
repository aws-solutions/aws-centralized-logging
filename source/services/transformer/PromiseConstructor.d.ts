// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
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
