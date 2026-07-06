import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  handleRulesListAction,
  loadRulesList,
} from "../models/rule-editor.server";
import { RulesListRoute } from "../components/rules-list-page";

const LIST_CONFIG = {
  discountMode: "standard" as const,
  heading: "Variant-Rabatte",
  newRulePath: "/app/rules/new",
  editRulePathPrefix: "/app/rules",
  emptyDescription:
    "Noch keine Rabatt-Regeln. Lege eine Regel an, um gezielt einzelne Varianten zu rabattieren – z. B. nur die 50 g-Variante, nicht die 100 g-Variante desselben Produkts.",
};

export const loader = ({ request }: LoaderFunctionArgs) =>
  loadRulesList(request, LIST_CONFIG);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  return handleRulesListAction(request, admin, session.shop);
};

export default function RulesIndex() {
  const loaderData = useLoaderData<typeof loader>();
  return <RulesListRoute loaderData={loaderData} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
