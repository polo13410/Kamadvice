package com.kamadvice.backend.repository;

import com.kamadvice.backend.domain.Item;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ItemRepository extends JpaRepository<Item, Long> {
}
