import StatusBadge from "./StatusBadge.jsx";

export default function ListRow({
  as = "button",
  selected,
  title,
  meta,
  status,
  trailing,
  href,
  onClick,
}) {
  const className = `list-row ${selected ? "is-selected" : ""}`;
  const body = (
    <>
      <div className="list-row-main">
        <div className="list-row-title">
          <span className="truncate">{title}</span>
          {status ? <StatusBadge status={status} /> : null}
        </div>
        {meta ? <div className="list-row-meta truncate">{meta}</div> : null}
      </div>
      {trailing ? <div className="list-row-trailing">{trailing}</div> : null}
    </>
  );

  if (as === "a") {
    return (
      <a className={className} href={href} onClick={onClick}>
        {body}
      </a>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {body}
    </button>
  );
}
