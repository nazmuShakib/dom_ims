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
import type { Customer } from "@/domain/types";

const MAX_VISIBLE_RESULTS = 50;

function customerLabel(customer: Customer): string {
  return customer.phone ? `${customer.name} — ${customer.phone}` : customer.name;
}

function matchRank(customer: Customer, query: string): number {
  const name = customer.name.toLowerCase();
  const phone = customer.phone?.toLowerCase() ?? "";
  if (name === query || phone === query) return 0;
  if (name.startsWith(query) || phone.startsWith(query)) return 1;
  return 2;
}

export function CustomerCombobox({
  customers,
  value,
  onChange,
}: {
  customers: Customer[];
  value: string;
  onChange: (customerId: string) => void;
}) {
  const { t } = useI18n();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedCustomer = customers.find((customer) => customer.id === value) ?? null;
  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return customers;
    return customers
      .filter((customer) =>
        customer.name.toLowerCase().includes(normalizedQuery)
        || customer.phone?.toLowerCase().includes(normalizedQuery),
      )
      .sort((left, right) => matchRank(left, normalizedQuery) - matchRank(right, normalizedQuery));
  }, [customers, query]);
  const visibleCustomers = filteredCustomers.slice(0, MAX_VISIBLE_RESULTS);
  const hiddenResultCount = filteredCustomers.length - visibleCustomers.length;
  const optionCount = visibleCustomers.length + 1;

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, optionCount - 1));
  }, [optionCount]);

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

  function openList() {
    setOpen(true);
    setQuery("");
    const selectedIndex = selectedCustomer
      ? customers.slice(0, MAX_VISIBLE_RESULTS)
          .findIndex((customer) => customer.id === selectedCustomer.id) + 1
      : 0;
    setActiveIndex(Math.max(0, selectedIndex));
  }

  function selectCustomer(customerId: string) {
    onChange(customerId);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openList();
      else setActiveIndex((current) => (current + 1) % optionCount);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openList();
      else setActiveIndex((current) => (current - 1 + optionCount) % optionCount);
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      selectCustomer(activeIndex === 0 ? "" : visibleCustomers[activeIndex - 1]?.id ?? "");
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  const displayValue = open ? query : selectedCustomer ? customerLabel(selectedCustomer) : "";

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name="customerId" value={value} />
      <div className="flex h-9 items-center rounded-[3px] border border-rule bg-card focus-within:border-signal">
        <Search aria-hidden="true" className="ml-2.5 size-4 shrink-0 text-graphite" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-label={t("common.customer")}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
          className="customer-combobox-input h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-graphite/80"
          value={displayValue}
          placeholder={t("checkout.chooseOrSearchCustomer")}
          onFocus={() => {
            if (!open) openList();
          }}
          onChange={(event) => {
            if (!open) setOpen(true);
            if (value) onChange("");
            setQuery(event.target.value);
            setActiveIndex(1);
          }}
          onKeyDown={handleKeyDown}
        />
        {selectedCustomer && !open ? (
          <button
            type="button"
            className="mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-[3px] text-graphite transition-colors hover:bg-plate hover:text-ink"
            aria-label={t("checkout.clearCustomer")}
            onClick={() => selectCustomer("")}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            className="mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-[3px] text-graphite transition-colors hover:bg-plate hover:text-ink"
            aria-label={t("checkout.openCustomerList")}
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
          <div
            id={`${listboxId}-option-0`}
            role="option"
            aria-selected={!value}
            className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[13px] ${activeIndex === 0 ? "bg-signal/10" : "hover:bg-plate"}`}
            onMouseDown={(event) => {
              event.preventDefault();
              selectCustomer("");
            }}
            onMouseEnter={() => setActiveIndex(0)}
          >
            <span>{t("checkout.walkIn")}</span>
            {!value && <Check aria-hidden="true" className="size-4 text-signal" />}
          </div>

          {visibleCustomers.length > 0 ? visibleCustomers.map((customer, index) => {
            const optionIndex = index + 1;
            return (
              <div
                key={customer.id}
                id={`${listboxId}-option-${optionIndex}`}
                role="option"
                aria-selected={customer.id === value}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${activeIndex === optionIndex ? "bg-signal/10" : "hover:bg-plate"}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectCustomer(customer.id);
                }}
                onMouseEnter={() => setActiveIndex(optionIndex)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{customer.name}</span>
                  {customer.phone && <span className="mt-0.5 block tnum text-[11px] text-graphite">{customer.phone}</span>}
                </span>
                {customer.id === value && <Check aria-hidden="true" className="size-4 shrink-0 text-signal" />}
              </div>
            );
          }) : (
            <p className="px-3 py-5 text-center text-[12px] text-graphite">{t("customers.noMatch")}</p>
          )}
          {hiddenResultCount > 0 && (
            <p className="border-t border-rule px-3 py-2 text-[11px] text-graphite">
              {t("checkout.moreMatches", { count: hiddenResultCount })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
