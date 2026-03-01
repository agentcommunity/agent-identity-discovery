'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildTxtRecord as buildTxtV11,
  buildWellKnownJson,
  computeBytes,
  parseRecordString,
  validate as validateV11,
} from '@/lib/generator/core';
import type { AidGeneratorFormData } from '@/lib/generator/types';

export type GeneratorFormData = AidGeneratorFormData;
export type FormPatch = Partial<GeneratorFormData>;

export type ServerValidationResult = {
  txt: string;
  json: Record<string, unknown>;
  bytes: { txt: number; desc: number };
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  success: boolean;
};

const defaultFormData: GeneratorFormData = {
  domain: 'example.com',
  uri: '',
  proto: 'mcp',
  auth: 'pat',
  desc: '',
  docs: '',
  dep: '',
  pka: '',
  kid: '',
};

export function useGeneratorForm() {
  const [formData, setFormData] = useState<GeneratorFormData>(() => {
    // Check for a domain pre-fill from the resolver (e.g. failed discovery → "create record")
    try {
      const prefill = globalThis.sessionStorage?.getItem('aid-generator-prefill');
      if (prefill) {
        globalThis.sessionStorage.removeItem('aid-generator-prefill');
        return { ...defaultFormData, domain: prefill };
      }
    } catch {
      /* SSR or storage unavailable */
    }
    return defaultFormData;
  });
  const [serverResult, setServerResult] = useState<ServerValidationResult | null>(null);

  // Pick up pre-fill from resolver when switching to #generator
  useEffect(() => {
    const checkPrefill = () => {
      if (globalThis.location?.hash !== '#generator') return;
      try {
        const prefill = sessionStorage.getItem('aid-generator-prefill');
        if (prefill) {
          sessionStorage.removeItem('aid-generator-prefill');
          setFormData((prev: GeneratorFormData) => ({ ...prev, domain: prefill }));
        }
      } catch {
        /* no-op */
      }
    };
    globalThis.addEventListener('hashchange', checkPrefill);
    return () => globalThis.removeEventListener('hashchange', checkPrefill);
  }, []);

  const txtRecordString = useMemo(() => buildTxtV11(formData), [formData]);
  const { txtBytes, descBytes } = useMemo(
    () => computeBytes(txtRecordString, formData.desc),
    [txtRecordString, formData.desc],
  );
  const specValidation = useMemo(() => validateV11(formData), [formData]);

  // Debounced server validation
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch('/api/generator/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
            signal: controller.signal,
          });
          if (!res.ok) return;
          const json = (await res.json()) as ServerValidationResult;
          setServerResult(json);
        } catch {
          /* no-op */
        }
      })();
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [formData]);

  const updateForm = (patch: FormPatch) =>
    setFormData((p: GeneratorFormData) => ({ ...p, ...patch }));

  const wellKnownJson = useMemo(() => buildWellKnownJson(formData), [formData]);

  const previewValid = serverResult?.success ?? specValidation.isValid;
  let previewErrors: Array<{ code: string; message: string }> = [];
  if (serverResult && serverResult.success === false) {
    previewErrors = serverResult.errors;
  } else if (specValidation.isValid === false) {
    previewErrors = specValidation.errors;
  }

  const loadExample = (ex: { domain: string; content: string }) => {
    const parsed = parseRecordString(ex.content);

    setFormData((previous: GeneratorFormData) => ({
      ...previous,
      domain: ex.domain,
      uri: parsed.uri ?? previous.uri,
      proto: parsed.proto ?? previous.proto,
      auth: parsed.auth ?? previous.auth,
      desc: parsed.desc ?? previous.desc,
      docs: parsed.docs ?? previous.docs,
      dep: parsed.dep ?? previous.dep,
      pka: parsed.pka ?? previous.pka,
      kid: parsed.kid ?? previous.kid,
    }));
  };

  return {
    formData,
    updateForm,
    loadExample,
    txtRecordString,
    txtBytes,
    descBytes,
    specValidation,
    serverResult,
    wellKnownJson,
    previewValid,
    previewErrors,
    dnsHost: `_agent.${formData.domain}`,
  };
}
