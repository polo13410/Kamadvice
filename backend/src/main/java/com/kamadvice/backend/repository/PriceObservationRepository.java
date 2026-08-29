package com.kamadvice.backend.repository;

import com.kamadvice.backend.domain.PriceObservation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PriceObservationRepository extends JpaRepository<PriceObservation, Long> {

    List<PriceObservation> findByResourceIdAndServerIdOrderByObservedAtDesc(Long resourceId, Long serverId);

    List<PriceObservation> findByItemIdAndServerIdOrderByObservedAtDesc(Long itemId, Long serverId);
}
