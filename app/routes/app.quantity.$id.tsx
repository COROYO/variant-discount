import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  loadRuleEditor,
  saveRuleEditor,
} from "../models/rule-editor.server";
import { RuleEditorPage } from "../components/rule-editor-page";

const EDITOR_CONFIG = {
  discountMode: "quantity" as const,
  listPath: "/app/quantity",
  editPath: "/app/quantity",
};

export const loader = (args: LoaderFunctionArgs) =>
  loadRuleEditor(args, EDITOR_CONFIG);

export const action = (args: ActionFunctionArgs) =>
  saveRuleEditor(args, EDITOR_CONFIG);

export default function QuantityRuleEditorRoute() {
  return <RuleEditorPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
