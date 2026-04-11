let nextId = 1;

export function createPlaceholderId(prefix: string): string {
  const id = `${prefix}-${nextId}`;
  nextId += 1;
  return id;
}
