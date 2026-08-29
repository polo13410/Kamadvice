package com.kamadvice.backend.repository;

import com.kamadvice.backend.domain.ScanRequestItem;
import com.kamadvice.backend.domain.ScanStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ScanRequestItemRepository extends JpaRepository<ScanRequestItem, Long> {

    List<ScanRequestItem> findByScanSessionIdAndStatus(Long scanSessionId, ScanStatus status);
}
