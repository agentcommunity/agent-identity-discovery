'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  TUTORIAL_EXAMPLES,
  REFERENCE_EXAMPLES,
  REAL_WORLD_EXAMPLES,
  PROTOCOL_EXAMPLES,
  OTHER_CHAT_EXAMPLES,
  type Example,
} from '@/lib/constants';

interface ExamplePickerProps {
  variant: 'buttons' | 'toggle';
  onSelect: (example: Example) => void;
  disabled?: boolean;
}

// A small sub-component to render a single example item, handling all icon types.
function ExampleItem({ example }: { example: Example }) {
  const { icon, title, label } = example;
  const displayLabel = label || title;

  const renderIcon = () => {
    if (typeof icon === 'string') {
      if (icon.startsWith('/')) {
        // It's an image path
        return <Image src={icon} alt={title} width={16} height={16} className="w-4 h-4" />;
      }
      // It's an emoji
      return <span>{icon}</span>;
    }
    // It's a React component type
    const IconComponent = icon;
    return <IconComponent className="w-4 h-4" />;
  };

  return (
    <div className="flex items-center gap-2">
      {renderIcon()}
      <span className="truncate">{displayLabel}</span>
    </div>
  );
}

export function ExamplePicker({ variant, onSelect, disabled }: ExamplePickerProps) {
  if (variant === 'toggle') {
    return (
      <div className="w-full">
        <div className="border-b border-muted mb-4 w-full" />
        <ToggleGroup
          type="single"
          onValueChange={(value) => {
            const ex = [
              ...TUTORIAL_EXAMPLES,
              ...REFERENCE_EXAMPLES,
              ...REAL_WORLD_EXAMPLES,
              ...PROTOCOL_EXAMPLES,
            ].find((e) => e.content === value);
            if (ex) onSelect(ex);
          }}
          className="flex flex-col gap-6 w-full items-start"
        >
          <div className="flex flex-col sm:flex-row gap-6 w-full">
            <div className="flex flex-col items-start gap-2 w-full sm:w-1/2">
              <h3 className="text-sm font-semibold">Tutorials</h3>
              <div className="flex flex-wrap gap-2 w-full">
                {TUTORIAL_EXAMPLES.map((ex) => (
                  <ToggleGroupItem
                    key={ex.title}
                    value={ex.content}
                    className="text-sm font-medium text-foreground"
                  >
                    {ex.title}
                  </ToggleGroupItem>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 w-full sm:w-1/2">
              <h3 className="text-sm font-semibold">Reference</h3>
              <div className="flex flex-wrap gap-2 w-full">
                {REFERENCE_EXAMPLES.map((ex) => (
                  <ToggleGroupItem
                    key={ex.title}
                    value={ex.content}
                    className="flex items-center gap-2 text-sm font-medium !text-foreground"
                  >
                    <ExampleItem example={ex} />
                  </ToggleGroupItem>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 w-full">
            <div className="flex flex-col items-start gap-2 w-full sm:w-1/2">
              <h3 className="text-sm font-semibold">Real World Examples</h3>
              <div className="flex flex-wrap gap-2 w-full">
                {REAL_WORLD_EXAMPLES.map((ex) => (
                  <ToggleGroupItem
                    key={ex.title}
                    value={ex.content}
                    className="flex items-center gap-2 text-sm font-medium !text-foreground"
                  >
                    <ExampleItem example={ex} />
                  </ToggleGroupItem>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 w-full sm:w-1/2">
              <h3 className="text-sm font-semibold">Protocols</h3>
              <div className="flex flex-wrap gap-2 w-full">
                {PROTOCOL_EXAMPLES.map((ex) => (
                  <ToggleGroupItem
                    key={ex.title}
                    value={ex.content}
                    className="flex items-center gap-2 text-sm font-medium !text-foreground"
                  >
                    <ExampleItem example={ex} />
                  </ToggleGroupItem>
                ))}
              </div>
            </div>
          </div>
        </ToggleGroup>
      </div>
    );
  }

  // Curated subset for the resolver chat — keep it focused
  const [expanded, setExpanded] = useState(false);

  const curated = [
    TUTORIAL_EXAMPLES[0], // Simple (basic MCP)
    TUTORIAL_EXAMPLES[1], // Local Docker
    REAL_WORLD_EXAMPLES[0], // Supabase
    PROTOCOL_EXAMPLES[1], // UCP Showcase
    REFERENCE_EXAMPLES[1], // Secure (auth-required)
    OTHER_CHAT_EXAMPLES[0], // No Server (error case)
  ].filter(Boolean);

  const allGroups: Array<{ label: string; examples: Example[] }> = [
    { label: 'Tutorials', examples: TUTORIAL_EXAMPLES },
    { label: 'Real World', examples: REAL_WORLD_EXAMPLES },
    { label: 'Protocols', examples: PROTOCOL_EXAMPLES },
    { label: 'Reference', examples: REFERENCE_EXAMPLES },
    { label: 'Edge Cases', examples: OTHER_CHAT_EXAMPLES },
  ];

  const renderButton = (ex: Example) => (
    <Button
      key={ex.title}
      variant="outline"
      className="text-sm px-3 py-1 h-auto"
      onClick={() => onSelect(ex)}
      disabled={disabled}
    >
      <ExampleItem example={ex} />
    </Button>
  );

  return (
    <div className="mb-2 space-y-2">
      <div className="flex flex-wrap gap-2 justify-center">
        {expanded
          ? allGroups.map((group) => (
              <div key={group.label} className="w-full">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 text-center">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2 justify-center mb-2">
                  {group.examples.map((ex) => renderButton(ex))}
                </div>
              </div>
            ))
          : curated.map((ex) => renderButton(ex))}
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          disabled={disabled}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {expanded ? 'Show less' : 'Show all 17 examples'}
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
    </div>
  );
}
