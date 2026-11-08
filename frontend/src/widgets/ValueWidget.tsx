import { ValueWidgetRuntime } from "@shared/widgets";
import WidgetFrame, { WidgetViewProps, formatWidgetValue } from "./WidgetFrame";

export default function ValueWidgetView(props: WidgetViewProps<ValueWidgetRuntime>) {
    return <WidgetFrame {...props}><div className="home-value-widget"><strong>{formatWidgetValue(props.observation?.value)}</strong></div></WidgetFrame>;
}
