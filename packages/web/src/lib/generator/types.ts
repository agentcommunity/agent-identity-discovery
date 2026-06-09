export interface AidGeneratorFormData {
  domain: string;
  uri: string;
  proto: string;
  auth: string;
  desc: string;
  docs?: string;
  dep?: string;
  pka?: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
