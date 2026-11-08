import { SwitchWidgetRuntime, switchState } from "@shared/widgets";
import WidgetFrame, { WidgetViewProps } from "./WidgetFrame";
import { useWidgetAction } from "./useWidgetAction";

export default function SwitchWidgetView(props: WidgetViewProps<SwitchWidgetRuntime>) {
    const { widget, observation } = props;
    const action = useWidgetAction(props.deviceCode, widget.id, observation, props.connected);
    const state = switchState(observation?.value, widget.state);
    const send = (desired: boolean) => void action.send({ state: desired }, widget.state
        ? desired ? widget.state.onValue : widget.state.offValue : undefined);
    return <WidgetFrame {...props} message={action.message} failed={action.failed}>
        <div className="home-switch-widget">
            <strong>{state === undefined ? "Unknown" : state ? "On" : "Off"}</strong>
            {state === undefined ? <div className="widget-switch-actions">
                <button type="button" className="home-action-button" disabled={action.busy || !widget.configured} onClick={() => send(true)} aria-label={`${widget.label}: turn on`}>On</button>
                <button type="button" className="home-action-button" disabled={action.busy || !widget.configured} onClick={() => send(false)} aria-label={`${widget.label}: turn off`}>Off</button>
            </div> : <button type="button" role="switch" aria-checked={state}
                className={state ? "home-switch on" : "home-switch"} aria-label={widget.label}
                disabled={action.busy || !widget.configured} onClick={() => send(!state)}><span /></button>}
        </div>
    </WidgetFrame>;
}
