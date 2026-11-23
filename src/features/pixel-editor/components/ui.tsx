import { ChevronDownIcon, ChevronRightIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";

const SUPPORTS_NATIVE_SWITCH =
	typeof HTMLInputElement !== "undefined" &&
	"switch" in HTMLInputElement.prototype;

const SUPPORTS_DIALOG_CLOSEDBY =
	typeof HTMLDialogElement !== "undefined" &&
	"closedBy" in HTMLDialogElement.prototype;

type IconButtonProps = {
	label: string;
	active?: boolean;
	disabled?: boolean;
	className?: string;
	tabIndex?: number;
	children: ReactNode;
	onClick: () => void;
};

export const IconButton = ({
	label,
	active,
	disabled = false,
	className = "",
	tabIndex,
	children,
	onClick,
}: IconButtonProps): FunctionComponent => (
	<button
		aria-label={label}
		aria-pressed={active === undefined ? undefined : active}
		disabled={disabled}
		tabIndex={tabIndex}
		title={label}
		type="button"
		className={`pe-btn flex items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent) disabled:cursor-not-allowed disabled:opacity-35 ${
			active
				? "border-(--pe-accent-ring) bg-(--pe-accent) text-(--pe-accent-ink) shadow-xs"
				: "border-transparent text-(--pe-text-secondary) hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text)"
		} ${className}`}
		onClick={onClick}
	>
		{children}
	</button>
);

type TextButtonProps = {
	children: ReactNode;
	title?: string;
	active?: boolean;
	variant?: "default" | "primary" | "ghost" | "danger";
	disabled?: boolean;
	className?: string;
	onClick: () => void;
};

export const TextButton = ({
	children,
	title,
	active = false,
	variant = "default",
	disabled = false,
	className = "",
	onClick,
}: TextButtonProps): FunctionComponent => {
	let style =
		"border-(--pe-border) bg-(--pe-bg-control) text-(--pe-text) hover:bg-(--pe-bg-control-hover)";
	if (variant === "primary") {
		style =
			"border-(--pe-accent-ring) bg-(--pe-accent) text-(--pe-accent-ink) hover:bg-(--pe-accent-hover)";
	} else if (variant === "ghost") {
		style =
			"border-transparent bg-transparent text-(--pe-text-secondary) hover:bg-(--pe-bg-control) hover:text-(--pe-text)";
	} else if (variant === "danger") {
		style =
			"border-(--pe-danger) bg-(--pe-danger-soft) text-(--pe-danger) hover:opacity-90";
	}
	if (active) {
		style =
			"border-(--pe-accent-ring) bg-(--pe-accent) text-(--pe-accent-ink)";
	}
	return (
		<button
			aria-pressed={active || undefined}
			className={`pe-btn inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent) disabled:cursor-not-allowed disabled:opacity-40 ${style} ${className}`}
			disabled={disabled}
			title={title}
			type="button"
			onClick={onClick}
		>
			{children}
		</button>
	);
};

type ToggleProps = { label: string; checked: boolean; onChange: () => void };

export const Toggle = ({
	label,
	checked,
	onChange,
}: ToggleProps): FunctionComponent => (
	<label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-(--pe-text-secondary)">
		<input
			checked={checked}
			className="h-3.5 w-3.5 rounded accent-(--pe-accent)"
			type="checkbox"
			onChange={onChange}
		/>
		{label}
	</label>
);

type SwitchProps = {
	checked: boolean;
	label: string;
	hideLabel?: boolean;
	description?: string;
	disabled?: boolean;
	title?: string;
	onChange: (checked: boolean) => void;
};

export const Switch = ({
	checked,
	label,
	hideLabel = false,
	description,
	disabled = false,
	title,
	onChange,
}: SwitchProps): FunctionComponent => {
	const inputId = useId();
	const nativeSwitchAttributes = { switch: "" } as Record<string, string>;
	const fallbackAttributes = SUPPORTS_NATIVE_SWITCH
		? {}
		: ({
				role: "switch",
				"aria-checked": checked,
				"data-switch-fallback": "",
			} as Record<string, unknown>);

	return (
		<label
			htmlFor={inputId}
			title={title}
			className={`flex items-center justify-between gap-3 select-none ${
				disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
			}`}
		>
			<span className={hideLabel ? "sr-only" : "min-w-0 flex-1"}>
				<span className="block text-xs font-medium text-(--pe-text)">
					{label}
				</span>
				{description && (
					<span className="mt-0.5 block text-[11px] leading-snug text-(--pe-text-muted)">
						{description}
					</span>
				)}
			</span>
			<input
				checked={checked}
				className="pe-switch"
				disabled={disabled}
				id={inputId}
				type="checkbox"
				{...nativeSwitchAttributes}
				{...fallbackAttributes}
				onChange={(event) => {
					onChange(event.target.checked);
				}}
			/>
		</label>
	);
};

type PanelCardProps = {
	title: string;
	badge?: string | number;
	actions?: ReactNode;
	collapsible?: boolean;
	defaultOpen?: boolean;
	className?: string;
	children: ReactNode;
};

export const PanelCard = ({
	title,
	badge,
	actions,
	collapsible = false,
	defaultOpen = true,
	className = "",
	children,
}: PanelCardProps): FunctionComponent => {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<section
			className={`pe-panel-card rounded-xl border border-(--pe-border) bg-(--pe-bg-panel) p-3 shadow-xs ${className}`}
		>
			<div className="flex items-center justify-between gap-2">
				{collapsible ? (
					<button
						aria-expanded={open}
						className="flex min-w-0 items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-wider text-(--pe-text-muted) transition-colors hover:text-(--pe-text)"
						type="button"
						onClick={() => {
							setOpen((current) => !current);
						}}
					>
						{open ? (
							<ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
						) : (
							<ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
						)}
						<span className="truncate">{title}</span>
						{badge !== undefined && (
							<span className="rounded-full bg-(--pe-bg-control) px-1.5 py-px text-[10px] font-medium text-(--pe-text-secondary)">
								{badge}
							</span>
						)}
					</button>
				) : (
					<div className="flex min-w-0 items-center gap-1.5">
						<h2 className="truncate text-[11px] font-semibold uppercase tracking-wider text-(--pe-text-muted)">
							{title}
						</h2>
						{badge !== undefined && (
							<span className="rounded-full bg-(--pe-bg-control) px-1.5 py-px text-[10px] font-medium text-(--pe-text-secondary)">
								{badge}
							</span>
						)}
					</div>
				)}
				{actions && (
					<div className="flex shrink-0 items-center gap-1">{actions}</div>
				)}
			</div>
			{(!collapsible || open) && <div className="mt-2.5">{children}</div>}
		</section>
	);
};

export const Kbd = ({ children }: { children: ReactNode }): FunctionComponent => (
	<kbd className="pe-kbd">{children}</kbd>
);

type ModalProps = {
	title: string;
	subtitle?: string;
	wide?: boolean;
	size?: "md" | "lg" | "xl";
	children: ReactNode;
	footer: ReactNode;
	onClose: () => void;
};

const isPointerOutsideDialog = (
	event: PointerEvent | React.PointerEvent<HTMLDialogElement>,
	dialog: HTMLDialogElement
): boolean => {
	const rect = dialog.getBoundingClientRect();
	return (
		event.clientX < rect.left ||
		event.clientX > rect.right ||
		event.clientY < rect.top ||
		event.clientY > rect.bottom
	);
};

export const Modal = ({
	title,
	subtitle,
	wide = false,
	size,
	children,
	footer,
	onClose,
}: ModalProps): FunctionComponent => {
	const dialogReference = useRef<HTMLDialogElement>(null);
	const pointerStartedOutside = useRef(false);
	const isUnmounting = useRef(false);
	const headingId = useId();
	const resolvedSize = size ?? (wide ? "lg" : "md");
	let widthClass = "max-w-md";
	if (resolvedSize === "lg") widthClass = "max-w-2xl";
	else if (resolvedSize === "xl") widthClass = "max-w-3xl";

	useEffect(() => {
		const dialog = dialogReference.current;
		if (!dialog) return;
		isUnmounting.current = false;
		if (!dialog.open) {
			dialog.showModal();
		}
		return (): void => {
			isUnmounting.current = true;
			if (dialog.open) {
				dialog.returnValue = "";
				dialog.close();
			}
		};
	}, []);

	const closedByAttribute = { closedby: "any" } as Record<string, string>;

	return (
		<dialog
			ref={dialogReference}
			aria-labelledby={headingId}
			{...closedByAttribute}
			className={`editor-modal max-h-[88dvh] w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-(--pe-border-strong) bg-(--pe-bg-panel) p-0 text-(--pe-text) ${widthClass}`}
			onCancel={(event): void => {
				event.preventDefault();
				onClose();
			}}
			onClose={(): void => {
				const dialog = dialogReference.current;
				if (!dialog) return;
				dialog.returnValue = "";
				// StrictMode cleanup calls dialog.close() (which queues an async close event)
				// before synchronously remounting with showModal(). Ignore stale close events
				// if the dialog is currently open again or unmounting.
				if (!dialog.open && !isUnmounting.current) {
					onClose();
				}
			}}
			onPointerDown={(event): void => {
				const dialog = dialogReference.current;
				if (!dialog || SUPPORTS_DIALOG_CLOSEDBY) return;
				pointerStartedOutside.current = isPointerOutsideDialog(event, dialog);
			}}
			onPointerUp={(event): void => {
				const dialog = dialogReference.current;
				if (!dialog || SUPPORTS_DIALOG_CLOSEDBY) return;
				if (
					pointerStartedOutside.current &&
					isPointerOutsideDialog(event, dialog)
				) {
					onClose();
				}
				pointerStartedOutside.current = false;
			}}
		>
			<div className="flex shrink-0 items-start justify-between gap-4 border-b border-(--pe-border) bg-(--pe-bg-chrome) px-5 py-3.5">
				<div className="min-w-0">
					<h2 className="text-sm font-semibold text-(--pe-text)" id={headingId}>
						{title}
					</h2>
					{subtitle && (
						<p className="mt-0.5 text-xs text-(--pe-text-muted)">
							{subtitle}
						</p>
					)}
				</div>
				<button
					aria-label="Close dialog"
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-(--pe-text-muted) transition-colors hover:bg-(--pe-bg-control-hover) hover:text-(--pe-text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--pe-accent)"
					title="Close (Esc)"
					type="button"
					onClick={onClose}
				>
					<XMarkIcon className="h-4 w-4" />
				</button>
			</div>
			<div className="editor-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-(--pe-text-secondary)">
				{children}
			</div>
			<div className="flex shrink-0 items-center justify-end gap-2 border-t border-(--pe-border) bg-(--pe-bg-chrome) px-5 py-3">
				{footer}
			</div>
		</dialog>
	);
};

export const Divider = (): FunctionComponent => (
	<div className="mx-1 h-5 w-px shrink-0 bg-(--pe-border)" />
);
