import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { IconName } from '@aiq/contracts';
import { Icon } from './icon.js';

export function Button({
  children,
  icon,
  variant,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; variant?: 'default' | 'primary' }) {
  return (
    <button type="button" className="aiq-button" data-variant={variant ?? 'default'} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone,
  title,
}: {
  children: ReactNode;
  tone?: 'demo' | 'ok' | 'danger';
  title?: string;
}) {
  return (
    <span className="aiq-badge" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

export function Card({ title, icon, children, help }: { title: ReactNode; icon?: IconName; children: ReactNode; help?:string }) {
  return (
    <section className="aiq-card">
      <h3 className="aiq-card-title" title={help} tabIndex={help?0:undefined}>
        {icon ? <Icon name={icon} /> : null}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="aiq-empty">{children}</div>;
}

export function Field({ label, children, help }: { label: ReactNode; children: ReactNode; help?:string }) {
  return (
    <label className="aiq-field" title={help}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="aiq-switch" style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
