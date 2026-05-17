import type { ChangeEvent } from 'react';
import { useId } from 'react';

export const ORG_EMAIL_DOMAIN = 'anamboatra.mg';

export function localPartFromInput(raw: string): string {
  const t = raw.trim();
  const at = t.indexOf('@');
  return (at >= 0 ? t.slice(0, at) : t).trimEnd();
}

export function fullOrgEmail(localPart: string): string {
  const local = localPartFromInput(localPart).replace(/\s+/g, '').toLowerCase();
  return `${local}@${ORG_EMAIL_DOMAIN}`;
}

type Props = {
  id?: string;
  value: string;
  onChange: (localPart: string) => void;
  required?: boolean;
  disabled?: boolean;
};

export function OrgEmailLocalField({ id: idProp, value, onChange, required, disabled }: Props) {
  const gen = useId();
  const rootId = idProp ?? gen;
  const suffixId = `${rootId}-domain-suffix`;

  return (
    <div
      className="org-email-split"
      role="group"
      aria-label={`Adresse de messagerie institutionnelle @${ORG_EMAIL_DOMAIN}`}
    >
      <input
        id={rootId}
        type="text"
        inputMode="email"
        autoComplete="username"
        required={required}
        disabled={disabled}
        spellCheck={false}
        placeholder="identifiant (ex. prenom.nom)"
        value={value}
        aria-describedby={suffixId}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(localPartFromInput(e.target.value))}
      />
      <span id={suffixId} className="org-email-suffix">
        @{ORG_EMAIL_DOMAIN}
      </span>
    </div>
  );
}
