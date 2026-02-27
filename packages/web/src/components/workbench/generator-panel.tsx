'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExamplePicker } from './example-picker';
import { CoreFields } from './v11-fields/core-fields';
import { MetadataFields } from './v11-fields/metadata-fields';
import { SecurityFields } from './v11-fields/security-fields';
import { PreviewPanel } from './generator/preview-panel';
import { useGeneratorForm, type FormPatch } from '@/hooks/use-generator-form';

export function GeneratorPanel() {
  const form = useGeneratorForm();

  return (
    <div className="h-full flex flex-col">
      <div data-scroll-region className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AID Generator</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CoreFields
                proto={form.formData.proto}
                auth={form.formData.auth}
                uri={form.formData.uri}
                domain={form.formData.domain}
                onChange={(patch: FormPatch) => form.updateForm(patch)}
              />

              <MetadataFields
                desc={form.formData.desc}
                docs={form.formData.docs}
                dep={form.formData.dep}
                descBytes={form.descBytes}
                onChange={(patch: FormPatch) => form.updateForm(patch)}
              />

              <SecurityFields
                pka={form.formData.pka}
                kid={form.formData.kid}
                onChange={(patch: FormPatch) => form.updateForm(patch)}
              />
            </CardContent>
          </Card>

          <PreviewPanel
            dnsHost={form.dnsHost}
            txtRecordString={form.txtRecordString}
            txtBytes={form.txtBytes}
            previewValid={form.previewValid}
            previewErrors={form.previewErrors}
            specValidation={form.specValidation}
            serverResult={form.serverResult}
            wellKnownJson={form.wellKnownJson}
          />

          <div className="space-y-2">
            <ExamplePicker variant="toggle" onSelect={(ex) => form.loadExample(ex)} />
          </div>
        </div>
      </div>
    </div>
  );
}
