import styles from "../styles/tag-pills.module.css";

type TagPillListProps = {
  tags: string[];
  onRemove: (tag: string) => void;
};

export function TagPillList({ tags, onRemove }: TagPillListProps) {
  if (tags.length === 0) return null;

  return (
    <div className={styles.list}>
      {tags.map((tag) => (
        <span key={tag} className={styles.pill}>
          <span className={styles.label}>{tag}</span>
          <button
            type="button"
            className={styles.remove}
            onClick={() => onRemove(tag)}
            aria-label={`Tag „${tag}“ entfernen`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
