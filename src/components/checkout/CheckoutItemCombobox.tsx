"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { useI18n } from "@/components/i18n/I18nProvider";

interface ItemOption {
  id: string;
  primary: string;
  secondary: string;
  searchable: string;
}

function rank(option: ItemOption, query: string): number {
  const primary = option.primary.toLowerCase();
  const secondary = option.secondary.toLowerCase();
  if (primary === query || secondary === query) return 0;
  if (primary.startsWith(query) || secondary.startsWith(query)) return 1;
  return 2;
}

function CheckoutItemCombobox({
  name,
  options,
  placeholder,
  emptyMessage,
}: {
  name: "productId" | "unitId";
  options: ItemOption[];
  placeholder: string;
  emptyMessage: string;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.id === value) ?? null;
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options
      .filter((option) => option.searchable.includes(normalizedQuery))
      .sort((left, right) => rank(left, normalizedQuery) - rank(right, normalizedQuery));
  }, [options, query]);

  useEffect(() => {
    setActiveIndex((current) => Math.max(0, Math.min(current, filteredOptions.length - 1)));
  }, [filteredOptions.length]);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const clearSelection = () => {
      setValue("");
      setQuery("");
      setOpen(false);
      setActiveIndex(0);
    };
    form.addEventListener("reset", clearSelection);
    return () => form.removeEventListener("reset", clearSelection);
  }, []);

  function openList() {
    setOpen(true);
    setQuery("");
    const selectedIndex = selected
      ? options.findIndex((option) => option.id === selected.id)
      : 0;
    setActiveIndex(Math.max(0, selectedIndex));
  }

  function selectOption(option: ItemOption) {
    setValue(option.id);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openList();
      else if (filteredOptions.length > 0) {
        setActiveIndex((current) => (current + 1) % filteredOptions.length);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openList();
      else if (filteredOptions.length > 0) {
        setActiveIndex((current) => (current - 1 + filteredOptions.length) % filteredOptions.length);
      }
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option) selectOption(option);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <div className="flex h-9 items-center rounded-[3px] border border-rule bg-card focus-within:border-signal">
        <Search aria-hidden="true" className="ml-2.5 size-4 shrink-0 text-graphite" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && filteredOptions.length > 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined}
          className="checkout-item-combobox-input h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-graphite/80"
          value={open ? query : selected?.primary ?? ""}
          placeholder={placeholder}
          onFocus={() => {
            if (!open) openList();
          }}
          onChange={(event) => {
            if (!open) setOpen(true);
            if (value) setValue("");
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        {selected && !open ? (
          <button
            type="button"
            className="mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-[3px] text-graphite transition-colors hover:bg-plate hover:text-ink"
            aria-label={placeholder}
            onClick={() => {
              setValue("");
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            className="mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-[3px] text-graphite transition-colors hover:bg-plate hover:text-ink"
            aria-label={placeholder}
            onClick={() => {
              if (open) {
                setOpen(false);
                setQuery("");
              } else {
                openList();
                inputRef.current?.focus();
              }
            }}
          >
            <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-[3px] border border-rule bg-card py-1 shadow-lg"
        >
          {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
            <div
              key={option.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={option.id === value}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${activeIndex === index ? "bg-signal/10" : "hover:bg-plate"}`}
              onMouseDown={(event) => {
                event.preventDefault();
                selectOption(option);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-ink">{option.primary}</span>
                <span className="mt-0.5 block truncate tnum text-[11px] text-graphite">{option.secondary}</span>
              </span>
              {option.id === value && <Check aria-hidden="true" className="size-4 shrink-0 text-signal" />}
            </div>
          )) : (
            <p className="px-3 py-5 text-center text-[12px] text-graphite">{emptyMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function CheckoutProductCombobox({
  products,
}: {
  products: Array<{
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    onHand: number;
  }>;
}) {
  const { t } = useI18n();
  const options = useMemo<ItemOption[]>(() => products
    .filter((product) => product.onHand > 0)
    .map((product) => ({
      id: product.id,
      primary: product.name,
      secondary: `${product.sku}${product.barcode ? ` · ${product.barcode}` : ""} · ${t("stock.onHandCount", { count: product.onHand })}`,
      searchable: `${product.name} ${product.sku} ${product.barcode ?? ""}`.toLowerCase(),
    })), [products, t]);

  return (
    <CheckoutItemCombobox
      name="productId"
      options={options}
      placeholder={t("checkout.searchProduct")}
      emptyMessage={t("checkout.noProductMatch")}
    />
  );
}

export function CheckoutUnitCombobox({
  units,
}: {
  units: Array<{
    id: string;
    productName: string;
    sku: string;
    serialNo: string;
    usedGrade: string | null;
  }>;
}) {
  const { t } = useI18n();
  const options = useMemo<ItemOption[]>(() => units.map((unit) => ({
    id: unit.id,
    primary: unit.serialNo,
    secondary: `${unit.productName} · ${unit.sku}${unit.usedGrade ? ` · ${unit.usedGrade.replace("GRADE_", "Grade ")}` : ""}`,
    searchable: `${unit.serialNo} ${unit.productName} ${unit.sku}`.toLowerCase(),
  })), [units]);

  return (
    <CheckoutItemCombobox
      name="unitId"
      options={options}
      placeholder={t("checkout.searchDevice")}
      emptyMessage={t("checkout.noDeviceMatch")}
    />
  );
}
