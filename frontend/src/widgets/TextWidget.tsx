import { TextWidgetRuntime } from "@shared/widgets";
import WidgetFrame, { WidgetViewProps, formatWidgetValue } from "./WidgetFrame";

export default function TextWidgetView(props: WidgetViewProps<TextWidgetRuntime>) {
    return <WidgetFrame {...props}><div className="home-text-widget"><strong>{formatWidgetValue(props.observation?.value)}</strong></div></WidgetFrame>;
}
