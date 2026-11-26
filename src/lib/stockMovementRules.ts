export const allowsZeroStockQuantity = (movementType: string) =>
  movementType === "initial" || movementType === "inventory";

export const isStockMovementQuantityValid = (movementType: string, quantity: string | number) => {
  if (typeof quantity === "string" && quantity.trim() === "") return false;
  const value = Number(quantity);
  if (!Number.isFinite(value) || value < 0) return false;
  return value > 0 || allowsZeroStockQuantity(movementType);
};
