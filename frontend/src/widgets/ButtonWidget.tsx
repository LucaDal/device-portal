import { ButtonWidgetRuntime } from "@shared/widgets";
import WidgetFrame, { WidgetViewProps } from "./WidgetFrame";
import { useWidgetAction } from "./useWidgetAction";

export default function ButtonWidgetView(props: WidgetViewProps<ButtonWidgetRuntime>) {
    const action = useWidgetAction(props.deviceCode, props.widget.id, props.observation, props.connected);
    return <WidgetFrame {...props} message={action.message} failed={action.failed}>
        <button type="button" className="home-action-button" disabled={action.busy || !props.widget.configured}
            onClick={() => void action.send()}>{action.busy ? "Sending..." : "Send"}</button>
    </WidgetFrame>;
}
