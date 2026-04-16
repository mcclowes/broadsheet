/* eslint-disable */
import * as Router from "expo-router";

export * from "expo-router";

declare module "expo-router" {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams:
        | {
            pathname: Router.RelativePathString;
            params?: Router.UnknownInputParams;
          }
        | {
            pathname: Router.ExternalPathString;
            params?: Router.UnknownInputParams;
          }
        | { pathname: `/add`; params?: Router.UnknownInputParams }
        | { pathname: `/modal`; params?: Router.UnknownInputParams }
        | { pathname: `/sign-in`; params?: Router.UnknownInputParams }
        | { pathname: `/_sitemap`; params?: Router.UnknownInputParams }
        | {
            pathname: `${"/(tabs)"}/explore` | `/explore`;
            params?: Router.UnknownInputParams;
          }
        | { pathname: `${"/(tabs)"}` | `/`; params?: Router.UnknownInputParams }
        | {
            pathname: `/read/[id]`;
            params: Router.UnknownInputParams & { id: string | number };
          };
      hrefOutputParams:
        | {
            pathname: Router.RelativePathString;
            params?: Router.UnknownOutputParams;
          }
        | {
            pathname: Router.ExternalPathString;
            params?: Router.UnknownOutputParams;
          }
        | { pathname: `/add`; params?: Router.UnknownOutputParams }
        | { pathname: `/modal`; params?: Router.UnknownOutputParams }
        | { pathname: `/sign-in`; params?: Router.UnknownOutputParams }
        | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams }
        | {
            pathname: `${"/(tabs)"}/explore` | `/explore`;
            params?: Router.UnknownOutputParams;
          }
        | {
            pathname: `${"/(tabs)"}` | `/`;
            params?: Router.UnknownOutputParams;
          }
        | {
            pathname: `/read/[id]`;
            params: Router.UnknownOutputParams & { id: string };
          };
      href:
        | Router.RelativePathString
        | Router.ExternalPathString
        | `/add${`?${string}` | `#${string}` | ""}`
        | `/modal${`?${string}` | `#${string}` | ""}`
        | `/sign-in${`?${string}` | `#${string}` | ""}`
        | `/_sitemap${`?${string}` | `#${string}` | ""}`
        | `${"/(tabs)"}/explore${`?${string}` | `#${string}` | ""}`
        | `/explore${`?${string}` | `#${string}` | ""}`
        | `${"/(tabs)"}${`?${string}` | `#${string}` | ""}`
        | `/${`?${string}` | `#${string}` | ""}`
        | {
            pathname: Router.RelativePathString;
            params?: Router.UnknownInputParams;
          }
        | {
            pathname: Router.ExternalPathString;
            params?: Router.UnknownInputParams;
          }
        | { pathname: `/add`; params?: Router.UnknownInputParams }
        | { pathname: `/modal`; params?: Router.UnknownInputParams }
        | { pathname: `/sign-in`; params?: Router.UnknownInputParams }
        | { pathname: `/_sitemap`; params?: Router.UnknownInputParams }
        | {
            pathname: `${"/(tabs)"}/explore` | `/explore`;
            params?: Router.UnknownInputParams;
          }
        | { pathname: `${"/(tabs)"}` | `/`; params?: Router.UnknownInputParams }
        | `/read/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ""}`
        | {
            pathname: `/read/[id]`;
            params: Router.UnknownInputParams & { id: string | number };
          };
    }
  }
}
