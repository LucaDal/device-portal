export function navigateTo(path: string) {
    if (typeof window === "undefined") return;
    if (window.location.pathname === path) return;

    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
}
