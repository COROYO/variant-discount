import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { AppFooter } from "../components/app-footer";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      {/* NavMenu wraps App Bridge's <ui-nav-menu>. The first child MUST set
         rel="home" so App Bridge knows which route is the app root; otherwise
         the entire menu fails to render in the Shopify admin sidebar. */}
      <NavMenu>
        <Link to="/app" rel="home">
          Rabatt-Regeln
        </Link>
        <Link to="/app/guide">Anleitung</Link>
        <Link to="/app/support">Support</Link>
      </NavMenu>
      <Outlet />
      <AppFooter />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
