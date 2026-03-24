declare global {
  interface FormData {
    append(name: string, value: any, fileName?: string): void;
  }

  var FormData: {
    prototype: FormData;
    new (): FormData;
  };
}

export {};
