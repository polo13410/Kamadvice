package com.kamadvice.backend.domain;

/**
 * Status of a {@link ScanSession} or a {@link ScanRequestItem}.
 */
public enum ScanStatus {
    PENDING,
    FOUND,
    NOT_FOUND,
    COMPLETED
}
