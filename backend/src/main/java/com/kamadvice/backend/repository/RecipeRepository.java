package com.kamadvice.backend.repository;

import com.kamadvice.backend.domain.Recipe;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RecipeRepository extends JpaRepository<Recipe, Long> {

    List<Recipe> findByProfessionIdAndLevelBetween(Long professionId, Integer minLevel, Integer maxLevel);
}
