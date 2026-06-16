import styles from "../styles/support.module.css";

const SUPPORT_AVATAR_SRC = "/support-avatar.png";

type SupportAvatarProps = {
  size?: "default" | "compact";
  showBadge?: boolean;
};

export function SupportAvatar({
  size = "default",
  showBadge = true,
}: SupportAvatarProps) {
  const dimension = size === "compact" ? 88 : 112;

  return (
    <div className={styles.avatarWrap}>
      <div className={styles.avatarRing}>
        <img
          src={SUPPORT_AVATAR_SRC}
          alt="Support"
          className={styles.avatarImage}
          width={dimension}
          height={dimension}
        />
      </div>
      {showBadge && <span className={styles.statusBadge}>Aktiv</span>}
    </div>
  );
}
