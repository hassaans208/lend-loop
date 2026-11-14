/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as automation from "../automation.js";
import type * as automationEvents from "../automationEvents.js";
import type * as dev from "../dev.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_automation from "../lib/automation.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_loanQueries from "../lib/loanQueries.js";
import type * as lib_signature from "../lib/signature.js";
import type * as lib_stateMachine from "../lib/stateMachine.js";
import type * as lib_validators from "../lib/validators.js";
import type * as loans from "../loans.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  automation: typeof automation;
  automationEvents: typeof automationEvents;
  dev: typeof dev;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/automation": typeof lib_automation;
  "lib/availability": typeof lib_availability;
  "lib/dates": typeof lib_dates;
  "lib/loanQueries": typeof lib_loanQueries;
  "lib/signature": typeof lib_signature;
  "lib/stateMachine": typeof lib_stateMachine;
  "lib/validators": typeof lib_validators;
  loans: typeof loans;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
