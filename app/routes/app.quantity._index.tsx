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
  discountMode: "quantity" as const,
  heading: "Mengenrabatte",
  newRulePath: "/app/quantity/new",
  editRulePathPrefix: "/app/quantity",
  emptyDescription:
    "Noch keine Mengenrabatte. Lege Stufen-Rabatte an, die automatisch greifen, sobald Kund:innen eine Mindestmenge einer Variante in den Warenkorb legen.",
};

export const loader = ({ request }: LoaderFunctionArgs) =>
  loadRulesList(request, LIST_CONFIG);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  return handleRulesListAction(request, admin, session.shop);
};

export default function QuantityRulesIndex() {
  const loaderData = useLoaderData<typeof loader>();
  return <RulesListRoute loaderData={loaderData} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
