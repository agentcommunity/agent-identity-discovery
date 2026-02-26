import { Info, Lightbulb, AlertTriangle, StickyNote, User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const calloutConfig = {
  tip: {
    icon: Lightbulb,
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-500/5',
    iconColor: 'text-emerald-600',
  },
  info: {
    icon: Info,
    border: 'border-l-blue-500',
    bg: 'bg-blue-500/5',
    iconColor: 'text-blue-600',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-l-amber-500',
    bg: 'bg-amber-500/5',
    iconColor: 'text-amber-600',
  },
  note: {
    icon: StickyNote,
    border: 'border-l-slate-400',
    bg: 'bg-slate-500/5',
    iconColor: 'text-slate-500',
  },
  user: {
    icon: User,
    border: 'border-l-purple-500',
    bg: 'bg-purple-500/5',
    iconColor: 'text-purple-600',
  },
  agent: {
    icon: Bot,
    border: 'border-l-cyan-500',
    bg: 'bg-cyan-500/5',
    iconColor: 'text-cyan-600',
  },
} as const;

type CalloutType = keyof typeof calloutConfig;

interface CalloutProps {
  type: CalloutType;
  title?: string;
  children: React.ReactNode;
}

export function Callout({ type, title, children }: CalloutProps) {
  const config = calloutConfig[type] ?? calloutConfig.note;
  const Icon = config.icon;

  return (
    <div className={cn('my-6 rounded-r-lg border-l-4 p-4', config.border, config.bg)}>
      {title && (
        <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
          <Icon className={cn('h-4 w-4 flex-shrink-0', config.iconColor)} />
          <span>{title}</span>
        </div>
      )}
      <div className="text-sm text-muted-foreground [&>p]:mb-2 [&>p:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}
