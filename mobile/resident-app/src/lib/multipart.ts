type UploadableFile = {
  uri: string;
  name?: string;
  type?: string;
};

type FormDataLike = {
  append: (name: string, value: any, fileName?: string) => void;
};

type FormDataCtor = new () => FormDataLike;

function getFormDataCtor(): FormDataCtor | null {
  const runtimeCtor = (globalThis as { FormData?: FormDataCtor }).FormData;
  if (runtimeCtor) {
    return runtimeCtor;
  }

  try {
    const fallbackModule = require('react-native/Libraries/Network/FormData');
    return (fallbackModule?.default || fallbackModule) as FormDataCtor;
  } catch {
    return null;
  }
}

export function buildSingleFileFormData(fieldName: string, file: UploadableFile, defaultFileName: string) {
  const FormDataClass = getFormDataCtor();
  if (!FormDataClass) {
    throw new Error('File uploads are not supported in this runtime.');
  }

  const formData = new FormDataClass();
  formData.append(fieldName, {
    uri: file.uri,
    name: file.name || defaultFileName,
    type: file.type || 'image/jpeg',
  });

  return formData as any;
}
