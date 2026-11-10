type Props = { children: string; onClick: () => void };

export default function AddButton({ children, onClick }: Props) {
    return <button type="button" className="dt-btn dt-btn-primary dt-btn-add" onClick={onClick}>
        <span className="dt-btn-add-icon" aria-hidden="true">+</span>
        {children}
    </button>;
}
